// POST /api/lead — receives the booking form and creates (or updates) a contact
// in the client's GoHighLevel sub-account.
//
// Runs on the server (Vercel function) so the Private Integration Token never
// reaches the browser. Both secrets come from the environment — see
// .env.example and the `env` schema in astro.config.mjs.
//
// Flow: validate → POST /contacts/upsert (creates, or updates an existing
// contact with the same e-mail/phone) → if there is a message, attach it as a
// note on the contact. The reg.nr lands in the custom field {{contact.reg_nr}}.
import type { APIRoute } from "astro";
import { GHL_PIT, GHL_LOCATION_ID, TURNSTILE_SECRET_KEY } from "astro:env/server";

export const prerender = false;

const GHL_API = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";

// Custom field keys in the sub-account, usable as merge tags in GHL workflows
// ({{contact.reg_nr}}, {{contact.lead_message}}).
const REG_NR_FIELD_KEY = "reg_nr";
const MESSAGE_FIELD_KEY = "lead_message";

// Shown in the contact's "source" and as tags, so the client can filter
// website leads in GHL.
const SOURCE = "Webbplats – bokningsformulär";
const TAGS = ["webbplats", "bokningsförfrågan"];

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });

const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

// Swedish numbers as people type them ("070-123 45 67", "0701234567",
// "+46 70 123 45 67", "0046…") → E.164, which is what GHL stores.
const normalizePhone = (raw: string) => {
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  if (digits.startsWith("0")) digits = `+46${digits.slice(1)}`;
  else if (!digits.startsWith("+")) digits = `+${digits}`;
  return digits;
};

// "abc 123" → "ABC123"
const normalizeRegNr = (raw: string) => raw.toUpperCase().replace(/[\s-]+/g, "");

// Cloudflare Turnstile, the bot check in front of the form. The widget hands
// the browser a one-time token in `cf-turnstile-response`; Cloudflare's docs
// are blunt that the token means nothing until the server redeems it here, so
// this runs before anything else looks at the lead.

const TURNSTILE_VERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// What the widget declares itself to be for, and where a token may legitimately
// have been minted. Siteverify echoes both back, and checking them is what
// stops the sitekey — which is public and visible in the page source — from
// being dropped onto someone else's page, solved there, and the resulting
// token replayed at this endpoint.
const TURNSTILE_ACTION = "booking";
const ALLOWED_HOSTNAMES = new Set([
  "hyperdetailing.se",
  "www.hyperdetailing.se",
  // Dev only. Cloudflare lets a widget run on localhost, so keeping these in
  // the production set would hand anyone a way to mint a token on their own
  // machine off the public sitekey.
  ...(import.meta.env.PROD ? [] : ["localhost", "127.0.0.1"]),
]);

// Fails closed, as Cloudflare's integration flow requires: anything short of a
// confirmed, in-scope success turns the request away — no secret, no token,
// Cloudflare slow, unreachable or answering with an error. (This used to fail
// open on a missing secret and on an outage, which is how the bot check sat
// switched off in production without anyone noticing.) A rejected visitor is
// told to ring instead, see the `bot_check_failed` message in Contact.astro.
//
// The one leniency is a missing secret in local development, so the form still
// works without Turnstile keys; a production build never gets it.
const verifyTurnstile = async (token: string, ip: string | null) => {
  if (!TURNSTILE_SECRET_KEY) {
    console.error("[lead] TURNSTILE_SECRET_KEY is unset — the bot check cannot run");
    return !import.meta.env.PROD;
  }
  if (!token) return false;

  const form = new URLSearchParams({ secret: TURNSTILE_SECRET_KEY, response: token });
  if (ip) form.set("remoteip", ip);

  try {
    const res = await fetch(TURNSTILE_VERIFY, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`siteverify answered ${res.status}`);
    const outcome = (await res.json()) as {
      success?: boolean;
      hostname?: string;
      action?: string;
      "error-codes"?: string[];
    };

    if (!outcome.success) {
      console.warn("[lead] Turnstile rejected the token:", outcome["error-codes"]?.join(", ") || "no reason given");
      return false;
    }

    if (!ALLOWED_HOSTNAMES.has(outcome.hostname ?? "") || outcome.action !== TURNSTILE_ACTION) {
      console.warn(
        `[lead] Turnstile token out of scope: hostname=${outcome.hostname} action=${outcome.action}`,
      );
      // Advisory off production: Cloudflare's test keys answer with an empty
      // action and a hostname that is not ours, so enforcing this locally
      // would make every dev run look like an attack.
      return !import.meta.env.PROD;
    }

    return true;
  } catch (cause) {
    console.error("[lead] Turnstile verification could not run:", cause);
    return false;
  }
};

export const POST: APIRoute = async ({ request }) => {
  let data: Record<string, unknown>;
  try {
    const type = request.headers.get("content-type") ?? "";
    if (type.includes("application/json")) {
      data = (await request.json()) as Record<string, unknown>;
    } else {
      data = Object.fromEntries((await request.formData()).entries());
    }
  } catch {
    return json(400, { ok: false, error: "invalid_body" });
  }

  // Honeypot: the form has a visually hidden "website" field that people
  // never fill in. Bots do — answer OK and drop it.
  if (text(data.website, 200)) return json(200, { ok: true });

  // Vercel sets x-forwarded-for; the site is DNS-only on Cloudflare, so
  // CF-Connecting-IP never arrives. remoteip is optional in Siteverify — a
  // missing one narrows the check rather than breaking it.
  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const passed = await verifyTurnstile(text(data["cf-turnstile-response"], 2048), clientIp);
  if (!passed) return json(403, { ok: false, error: "bot_check_failed" });

  const lead = {
    firstName: text(data.firstName, 80),
    lastName: text(data.lastName, 80),
    email: text(data.email, 200).toLowerCase(),
    phone: text(data.phone, 40),
    regNr: text(data.regNr, 20),
    message: text(data.message, 4000),
  };

  const missing = (["firstName", "lastName", "email", "phone", "regNr"] as const).filter(
    (key) => !lead[key],
  );
  if (missing.length) return json(400, { ok: false, error: "missing_fields", fields: missing });

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(lead.email)) {
    return json(400, { ok: false, error: "invalid_email" });
  }

  const phone = normalizePhone(lead.phone);
  if (!/^\+\d{8,15}$/.test(phone)) return json(400, { ok: false, error: "invalid_phone" });

  const regNr = normalizeRegNr(lead.regNr);
  if (!/^[A-ZÅÄÖ0-9]{2,10}$/.test(regNr)) return json(400, { ok: false, error: "invalid_reg_nr" });

  // Misconfigured deployment: say so in the log rather than throwing an opaque
  // 500, and let the visitor fall back to phone/e-mail.
  if (!GHL_PIT || !GHL_LOCATION_ID) {
    console.error(
      "[lead] missing environment variables:",
      [!GHL_PIT && "GHL_PIT", !GHL_LOCATION_ID && "GHL_LOCATION_ID"].filter(Boolean).join(", "),
    );
    return json(503, { ok: false, error: "not_configured" });
  }

  const headers = {
    Authorization: `Bearer ${GHL_PIT}`,
    Version: GHL_VERSION,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  // ---- 1. Create or update the contact
  const upsert = await fetch(`${GHL_API}/contacts/upsert`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      locationId: GHL_LOCATION_ID,
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email,
      phone,
      country: "SE",
      source: SOURCE,
      tags: TAGS,
      customFields: [{ key: REG_NR_FIELD_KEY, field_value: regNr }],
    }),
  });

  if (!upsert.ok) {
    console.error("[lead] GHL upsert failed", upsert.status, await upsert.text());
    return json(502, { ok: false, error: "crm_error" });
  }

  const { contact } = (await upsert.json()) as { contact?: { id?: string } };

  // ---- 2. The message, twice over: to a custom field so the GHL workflows can
  //         quote it with {{contact.lead_message}} (a note cannot be read by a
  //         merge tag), and to a note, because the field holds only the latest
  //         message — the next enquiry from the same person overwrites it.
  //
  //         Both are separate calls on purpose, and neither may fail the
  //         booking. GHL rejects an upsert carrying a custom field key the
  //         sub-account does not have, so putting lead_message in the upsert
  //         above would turn every booking into a 502 the day the field is
  //         missing or renamed. Out here the worst case is a log line, and the
  //         field starts working by itself once someone creates it in GHL —
  //         no deploy needed.
  if (lead.message && contact?.id) {
    const field = await fetch(`${GHL_API}/contacts/${contact.id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        customFields: [{ key: MESSAGE_FIELD_KEY, field_value: lead.message }],
      }),
    });
    if (!field.ok) {
      console.error(
        `[lead] GHL ${MESSAGE_FIELD_KEY} update failed`,
        field.status,
        await field.text(),
      );
    }

    const note = await fetch(`${GHL_API}/contacts/${contact.id}/notes`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        body: `Meddelande från bokningsformuläret på webbplatsen:\n\n${lead.message}`,
      }),
    });
    // A failed note must not fail the booking request — the contact exists.
    if (!note.ok) console.error("[lead] GHL note failed", note.status, await note.text());
  }

  return json(200, { ok: true });
};

// Anything but POST
export const ALL: APIRoute = () => json(405, { ok: false, error: "method_not_allowed" });
