# Hyper Detailing Umeå — Landing Page

Marketing site for Hyper Detailing, a car detailing shop in Umeå. Built with
Astro (static output), converted from the "Darken" Figma template and fully
customized for the client. All copy is in Swedish.

## Commands

| Command           | Action                                      |
| :---------------- | :------------------------------------------ |
| `npm install`     | Install dependencies                        |
| `npm run dev`     | Start local dev server at `localhost:4322`  |
| `npm run build`   | Build the production site to `./dist/`      |
| `npm run preview` | Preview the production build locally        |

## Launch status (2026-09-09)

Verified on the production build (`npm run build` + `astro preview`):

- **Cookie consent: Cookiebot** (re-added 2026-09-21). `uc.js` is the first
  script in `<head>` in `src/layouts/BaseLayout.astro`, with
  `data-blockingmode="auto"` so it can block non-essential scripts before they
  run; `cd.js` renders the auto-generated declaration in the "Cookies" section
  of `/integritetspolicy`, beside a button that reopens the dialog via
  `Cookiebot.renew()`. Domain group `b99fb9e4-df67-46d8-beb4-61fc831ce482`.
  Categories and dialog copy live in the Cookiebot dashboard, not here.
- **The banner has been on, off and on again.** It shipped 2026-09-15 at the
  client's request, came out 2026-09-20 — the site set no cookies but its own
  `CookieConsent`, so the banner existed to ask permission for itself — and went
  back in 2026-09-21 ahead of adding analytics or ad tracking, which do need
  consent. The 2026-09-15 dialog was also misconfigured: statistics and
  marketing were pre-ticked (not valid consent — CJEU C-673/17 Planet49), there
  was no reject button beside "Tillåt alla", and the copy described ad targeting
  the site does not do. Check all three in the dashboard before trusting it.
- **Every site resource is first-party.** Fonts, GSAP, images and video are
  served from the site's own origin; the booking form posts to the site's own
  `/api/lead`, which talks to GoHighLevel server-side.
- **Cloudflare Turnstile** (added 2026-09-20) is the bot check on the booking
  form, and the one third-party request the page makes besides Cookiebot. Keep
  the widget on **pre-clearance off**: that setting is the only thing that makes
  Turnstile set a `cf_clearance` cookie, and it is why the check counts as
  strictly necessary and sits outside the consent categories. Keys are
  `PUBLIC_TURNSTILE_SITEKEY` and `TURNSTILE_SECRET_KEY`; the token is redeemed
  server-side in `/api/lead`, which also checks the hostname and the `booking`
  action, and fails closed: a missing secret, a missing or rejected token, or
  an unreachable Cloudflare all turn the booking away (the visitor is told to
  ring instead). Both keys are therefore required in production; locally the
  check is skipped when the secret is unset. The honeypot field remains as the
  second layer.
- **No dev tooling in the build** — the Agentation widget, React and the
  `localhost:4747` probe exist in `npm run dev` only.
- **axe-core** (WCAG 2.x A/AA + best-practice): zero violations on `/`,
  `/villkor`, `/integritetspolicy` once the dev widget is excluded. To re-run:
  copy `node_modules/axe-core/axe.min.js` into `public/`, load it in the page
  and call `axe.run()`; delete the copy afterwards.
- **Contrast**: body grey `#8a8a8a` is ≥4.9:1 on every surface; buttons
  ≥4.7:1.
- **Unused media** (61 MB of raw Instagram downloads with unblurred plates,
  AI renders, generation sources) moved from `public/` to
  `source-material/public-unused/` so it is not published. `public/` is 19 MB.
- Custom `404.astro`; sitemap excludes it.

## Before launch — what the client must supply

Everything else on the site is verified and final. These values live in
[`src/data/site.ts`](src/data/site.ts) and cannot be looked up from outside:

1. ~~**`orgNumber`**~~ — done: `559146-3665` (2026-09-24). Rendered in the
   footer and on both legal pages.
2. **`vatNumber`** — momsregistreringsnummer (if momsregistrerad).
   E-handelslagen (2002:562) 8 § requires it on the site.
3. **`legalName`** — the registered company name, if it differs from
   "Hyper Detailing Umeå".
4. **`socials`** — Facebook and Instagram page URLs. Rows without a URL are not
   rendered, so no dead links ship; once filled in they appear in the footer
   and in the structured data (`sameAs`).
5. **Domain** — `site` in `astro.config.mjs` is `https://hyperdetailing.se`, the
   domain connected to the Vercel project. Canonical URLs, Open Graph, the
   sitemap and `public/robots.txt` all derive from it (update `robots.txt` by
   hand).

Verified against the Google Business profile on 2026-09-09: phone
`076-843 63 93`, address `Industrivägen 22, 901 30 Umeå`, hours every day
09–19, rating 5,0 from 15 reviews. Email from the client (August 2026).

Also confirm with the client before launch:

- The **service and package descriptions** (`src/data/services.ts`,
  `src/data/packages.ts`) — the bullets describe what each package includes and
  are marketing claims. The "8 års hållbarhet" claim on the ceramic coating
  must be backed by the product's own warranty.
- The **24-hour cancellation rule** and the wording on **avbokningsavgift** in
  `/villkor` — the page says the fee is stated in the booking confirmation, so
  the client must actually do that.
- The **photo consent** promise in `/integritetspolicy` ("vi publicerar bara
  bilder på din bil om du har godkänt det").
- The **data processing agreement with HighLevel** — `/integritetspolicy` says
  the US transfer rests on standard contractual clauses in the DPA with the
  provider; sign it in the HighLevel account if not already done.
- **Payment methods** — `/villkor` currently says they are announced at booking.
- The **person visible in the first second of the desktop hero video** — fine
  if it is the owner or an employee who agreed to appear; otherwise re-cut.
- **Hosting**: serve over HTTPS with a redirect from http. If the host adds its
  own cookies (e.g. Cloudflare bot management), they count as strictly
  necessary, but check and, if so, mention them in `/integritetspolicy`.

## Legal compliance (Sweden)

| Requirement | Statute | Where |
|---|---|---|
| Company name, address, e-mail, org.nr, VAT no. easy to find | E-handelslagen 8 § | Footer, `/villkor`, `/integritetspolicy` |
| Consumer prices incl. VAT; "från"-prices explained | Prisinformationslagen | `#priser` note |
| No misleading claims; reviews verbatim; only real photos labelled as real | Marknadsföringslagen 10 § | `src/data/reviews.ts`, `src/data/gallery.ts` |
| Information before a distance contract; 14-day ångerrätt | Distansavtalslagen 2 kap. | `/villkor` §5 |
| Reklamation, tilläggsarbete, skadestånd | Konsumenttjänstlagen | `/villkor` §3, §8, §9 |
| ARN information | Lag (2015:671) om alternativ tvistlösning | `/villkor` §10 |
| Privacy notice (art. 13) | GDPR | `/integritetspolicy`, linked from the form |
| Consent before non-essential cookies; cookie information | LEK 9 kap. 28 §, GDPR | Cookiebot banner (`BaseLayout.astro`); declaration + renew button in `/integritetspolicy` |
| Turnstile IP processing disclosed | GDPR art. 13, 6.1 f | `/integritetspolicy`: Cloudflare named as recipient, legitimate interest, no cookie |
| Pause control for auto-playing video and carousels | WCAG 2.2.2 (best practice; EN 301 549) | Hero, `#galleri` |

Registration plates in customer photos are blurred (a readable plate is
personal data). Blur before adding new photos.

## Bokningsformulär → GoHighLevel

The form in `Contact.astro` POSTs JSON to the server route
[`src/pages/api/lead.ts`](src/pages/api/lead.ts) (`prerender = false`, deployed
as a Vercel function via `@astrojs/vercel`). The route validates the fields,
normalises the phone number to E.164 and the reg.nr to `ABC123`, then calls
the LeadConnector API:

1. `POST /contacts/upsert` — creates the contact, or updates an existing one
   with the same e-mail/phone. Sets `firstName`, `lastName`, `email`, `phone`,
   `country: SE`, `source: "Webbplats – bokningsformulär"`, tags `webbplats` +
   `bokningsförfrågan`, and the custom field `{{contact.reg_nr}}`.
2. `POST /contacts/{id}/notes` — the optional message becomes a note.

Spam: a hidden honeypot field (`website`) makes the route answer OK and drop
the submission. Every other page on the site is still fully static.

**Environment variables** (server-only, never bundled — see `.env.example`):

| Variable | Value |
|---|---|
| `GHL_PIT` | Private Integration Token from the sub-account (Settings → Private Integrations; needs `contacts.write`) |
| `GHL_LOCATION_ID` | The sub-account's location id |

They are declared in `astro.config.mjs` (`env.schema`, `access: "secret"`) and
read with `astro:env/server`. Locally: copy `.env.example` to `.env`
(git-ignored) — and restart `astro dev` after creating it, the dev server does
not pick up a new `.env` on its own. On Vercel: Project → Settings →
Environment Variables (already set for this project).

Verified 2026-09-09 against the live sub-account: validation (400s), honeypot,
upsert with `reg_nr`, note creation, and a real browser submission. All test
contacts were deleted afterwards.

## Page structure

| Section | Component | Anchor |
|---|---|---|
| Navbar | `Navbar.astro` | — |
| Hero (video + rating badge + map card) | `Hero.astro` | `#top` |
| Reviews + customer cars | `Spotlight.astro` | `#galleri` |
| Services | `Features.astro` | `#tjanster` |
| Prices | `Pricing.astro` | `#priser` |
| FAQ | `Faq.astro` | `#faq` |
| CTA | `Cta.astro` | — |
| Contact & booking form | `Contact.astro` | `#kontakt` |
| Footer (legal info, links) | `Footer.astro` | — |

Legal pages: `/integritetspolicy`, `/villkor` (shared shell `LegalPage.astro`).

Built but not rendered: `Gallery.astro`, `Showcase.astro`, `Testimonials.astro`
and `SocialProof.astro`. The last two contain **invented** placeholder content
and must not be re-added without real data.

Design tokens (colors, type scale, fluid scaling) live in
`src/styles/global.css`. The brand look is a dark theme with an orange accent
(`#fe4a00`).
