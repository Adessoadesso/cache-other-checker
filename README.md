# Panoramic Ireland — Astro 7 rebuild

Rebuild of panoramicireland.com from Joomla 5, targeting Cloudflare Pages/Workers
with D1 for booking data, Stripe for payment, and Google Calendar as the
availability source of truth.

> Originally scaffolded on Astro 6, upgraded to Astro 7 on 2026-07-08 while the
> project was still empty of real content — Astro 7's Rust compiler parses
> markup more strictly than the old one (no more silent auto-correction of
> unclosed tags, etc.), so it's worth knowing about *before* migrating the
> Joomla blog/tour content across, not after.

## Stack

- **Astro 7** (`7.0.6`), SSR (`output: 'server'`) via `@astrojs/cloudflare`
- **Cloudflare Pages** + **D1** (bookings, tours, availability locking)
- **Stripe Checkout** for payment
- **Google Calendar** (service account) for real availability + confirmed bookings
- **Content collections** for tours and blog posts (Markdown, migrate from
  Joomla export)
- Fonts: Cormorant Garamond (display) + DM Sans (body), self-hosted via
  `@fontsource`
- Palette: forest green / gold on warm paper — tokens in
  `src/styles/global.css`

## Structure

```
src/
  layouts/BaseLayout.astro       shared head, skip link, header/footer
  components/
    Header.astro / Footer.astro
    CrossfadeHero.astro          CSS-only crossfade hero (no JS, LCP-safe)
  content/
    tours/*.md                   tour content collection (1 sample entry)
    blog/*.md                    journal posts (empty — pending migration)
    config.ts                    zod schemas for both collections
  lib/
    stripe.ts                    Stripe client factory
    calendar.ts                  Google Calendar freebusy + event creation
  pages/
    index.astro, about.astro, contact.astro
    tours/index.astro, tours/[slug].astro
    blog/index.astro, blog/[slug].astro
    api/checkout.ts              creates D1 hold + Stripe Checkout session
    api/webhook/stripe.ts        confirms payment, books slot, writes to GCal
    api/enquiry.ts               contact form handler (stub — needs email send)
db/
  schema.sql                     D1 schema: tours, availability_slots,
                                  bookings, webhook_events
wrangler.toml                    Pages/D1/env config
.dev.vars.example                copy to .dev.vars for local secrets
```

## Local setup

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in real test-mode Stripe + GCal creds
npx wrangler d1 create panoramicireland-db
# paste the returned database_id into wrangler.toml
npx wrangler d1 execute panoramicireland-db --local --file=./db/schema.sql
npx wrangler types   # regenerates types from wrangler.toml after any config change
npm run dev
```

Astro 6 + `@astrojs/cloudflare` v13 run `astro dev` directly on workerd (Cloudflare's
real runtime, via Miniflare) — there's no separate "proxy" mode, so D1/secrets are
available in `npm run dev` as long as `.dev.vars` and `wrangler.toml` are filled in.
Bindings are read with `import { env } from 'cloudflare:workers'` inside
non-prerendered routes (see `src/pages/api/*`) — this replaced
`Astro.locals.runtime.env` from Astro 5.

## Deployment

This is a Cloudflare Workers project (Workers now serve static assets directly;
Wrangler's Pages command isn't used here).

```bash
npx wrangler d1 execute panoramicireland-db --remote --file=./db/schema.sql
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put GOOGLE_CALENDAR_CLIENT_EMAIL
npx wrangler secret put GOOGLE_CALENDAR_PRIVATE_KEY
npx wrangler secret put GOOGLE_CALENDAR_ID
npm run build
npx wrangler deploy
```

Point the Stripe webhook endpoint at `/api/webhook/stripe` in the Stripe
dashboard and copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

## Scheduled worker (expired hold release)

`worker/entry.ts` is a custom Worker entrypoint — set as `main` in
`wrangler.toml` — that wraps Astro's own request handler and adds a
`scheduled()` handler for the Cron Trigger defined under `[triggers]`
(every 15 minutes). It calls `releaseExpiredHolds()` in
`src/lib/release-expired-holds.ts`, which:

- Finds any `availability_slots` row stuck in `held` past its `held_until`
- If a `requested` booking is still attached to that slot, auto-declines it
  (tagged `[auto-declined: hold expired]` in `notes`) so it doesn't sit
  invisibly forever
- Releases the slot back to `open`

This matters more now than it would with Stripe alone — the admin "take a
booking" flow holds a slot for 72 hours awaiting manual confirmation, versus
Stripe Checkout's ~15 minutes, so a longer-running sweep is worth having
regardless of which payment path created the hold.

To test locally: `wrangler dev --test-scheduled`, then
`curl "http://localhost:8787/__scheduled"` (or `/cdn-cgi/handler/scheduled`
depending on your Wrangler version) to fire it on demand.

## Site structure & URL preservation

Page names, titles, and URLs match the **live panoramicireland.com main menu
exactly** — sourced from an actual export of that menu (`src/data/guide-menu.ts`
and `src/data/workshops-menu.ts`), not reconstructed from memory or guesswork.
This matters for SEO: every URL the old site had needs to keep resolving
somewhere, whether that's real content or a clearly-marked placeholder, not
a fresh 404.

**What's real vs. placeholder right now:**

- `/`, `/dublin`, `/about`, `/blog`, `/contact`, `/guide-to-ireland`,
  `/photography-workshops-ireland` and all 34 of their nested child pages
  (Belfast, Causeway Coast, Dingle, Kilkenny, the Guide's geography/weather/
  pub pages, etc.) all exist at their **exact original URLs** today —
  but most are `PlaceholderLayout` pages, not real content. They say so
  honestly ("this page is being migrated") rather than showing fabricated
  copy. This is deliberate: preserving the URL and title now, backfilling
  real content once it's actually migrated, rather than inventing
  placeholder marketing copy that would need rewriting anyway.
- The 4 blog-category pages that were in a *hidden* Joomla menu (not the
  visible nav) got the same treatment — still real URLs, just not linked
  from the header/footer, matching how they worked on the old site.
- `/tours` and `/tours/[slug]` (the D1-backed booking demo pages built
  earlier) **aren't part of the real site's URL scheme** and aren't linked
  from the header, footer, or homepage anymore. They still exist as a
  working technical reference for the booking system — useful once real
  tour pages need a "Book this" deep link — but are currently orphaned
  from navigation. Don't forget these are sitting there unlinked.

**Header** shows the real top-level items only (Home / Dublin Photo Tours /
Guide / Photo Workshops / About / Blog / Contact) — no dropdown flyouts.
The old site's nested dropdowns (Guide's 14 pages, Photo Workshops' 20)
moved to: (a) each section's own index/hub page, and (b) the footer, which
lists every top-level child as a real link. This is an intentional
structural change from the old dropdown nav — the reasoning is that SEO
cares about crawlable links existing *somewhere*, not about literally
replicating a hover-menu, and a 3-level dropdown has no good mobile
equivalent. A checkbox-driven mobile menu (`src/components/Header.astro`)
now exists where there was none before — needs no JavaScript.

**Next step for these pages:** the actual content migration (the JSON
parser for SP Page Builder pages discussed earlier) replaces
`PlaceholderLayout` with real content per page, without needing to touch
the URL, nav, or footer again — those are already locked in correctly.



The marketing pages (home, tours, blog, about, contact) are fully static and
deploy to cPanel via plain FTP/rsync — no PHP, no server logic there at all.
Everything dynamic (the enquiry email endpoint today; booking/D1/admin as
that gets built out) runs on Cloudflare Workers under `api.panoramicireland.com`.

```
astro build
  → dist/client/   → static HTML, ships to cPanel
  → dist/server/    → Worker bundle (api.* + /admin), ships to Cloudflare
```

**cPanel deploy:** upload the contents of `dist/client/` to your document
root (rsync/FTP, whatever you already use). That's it — no build step runs
on cPanel, no PHP needed for the pages themselves.

**Cloudflare deploy:** `npx wrangler deploy` as described above. DNS for
`api.panoramicireland.com` should point at the Worker (a CNAME through
Cloudflare, proxied); `panoramicireland.com` itself keeps pointing at cPanel
as it does today.

**The contact form** on the static `/contact` page posts directly to
`https://api.panoramicireland.com/api/enquiry` as a plain HTML form
submission — not a `fetch()` call — so this is an ordinary cross-origin
*navigation*, not a CORS-governed request. No CORS headers are needed for
this to work today. If the form is ever enhanced with client-side JS
(inline validation, no full-page reload), that's the point CORS headers
would need adding to `/api/enquiry.ts` — noted in a comment there.

### Sending enquiry emails

The enquiry endpoint sends via [Resend](https://resend.com) (Cloudflare's
own recommended path for Workers — the old free MailChannels integration
was discontinued in 2024). Every enquiry is also saved to the `enquiries`
table in D1 regardless of whether the email send succeeds, so nothing is
lost if Resend has a bad day.

```bash
npx wrangler secret put RESEND_API_KEY
```

`ENQUIRY_TO_EMAIL` / `ENQUIRY_FROM_EMAIL` are plain vars in `wrangler.toml`
(not secret) — update them to your real addresses. The from-address domain
needs to be verified in Resend before it'll send.

The `enquiries` table is deliberately wider than the current form needs —
`tour_interest`, `preferred_dates`, `guest_count` are already there for
when the form grows those inputs, plus an `extra` JSON column as a
catch-all for anything added ad hoc later without a migration.

## Admin panel



`/admin` is a phone-friendly booking/availability manager — bookings queue
(confirm/decline/mark paid), and per-tour availability (add slots, cancel,
take a booking by phone/email). Server-rendered, plain HTML forms, no client
JS required, so it works reliably on a phone browser.

**It is not secure until you do this one manual step** — the app verifies a
Cloudflare Access token in `src/middleware.ts`, but Access itself has to be
configured in the Cloudflare dashboard first:

1. Cloudflare dashboard → **Zero Trust** → **Access** → **Applications** → **Add an application** → **Self-hosted**
2. Domain: `panoramicireland.com`, path: `/admin*`
3. Add a policy — e.g. "Allow" for your own email (or a small allowlist for you + Darren)
4. Choose a login method — email OTP is simplest, no extra setup
5. Once saved, open the application and copy:
   - **Application Audience (AUD) Tag** → `CF_ACCESS_AUD` in `wrangler.toml`
   - Your **team domain** (shown at the top of the Zero Trust dashboard, looks like `yourteam.cloudflareaccess.com`) → `CF_ACCESS_TEAM_DOMAIN`
6. Redeploy (`wrangler secret put` isn't needed here — these two are identifiers, not secrets, so they live in `[vars]` in `wrangler.toml`)

After that, visiting `/admin` prompts an Access login (email OTP) before
anything else loads — Cloudflare blocks the request at the edge, and
`src/middleware.ts` independently verifies the Access JWT against
Cloudflare's public keys as a second check, in case the Access policy is ever
changed or misconfigured later.



## Not yet done (next passes)

**Deliberately deferred for v1** — the plan is pages + content live fast on
a simple enquiry form, live availability/booking comes as a background
project once the site itself is live:

- Public-facing booking request form (pick tour → real availability →
  submit) — v1 is enquiry-only by design; `listBusySlots()` in
  `src/lib/calendar.ts` and the whole `requested → confirmed → paid` D1
  flow are built and working (provable via the admin panel), just not
  exposed on the public site yet
- SumUp/Stripe payment automation — same reasoning, deferred until the
  booking form itself is live

**Actual launch blockers:**

- DNS: `api.panoramicireland.com` needs a proxied CNAME to the Worker;
  cPanel keeps the root domain as-is
- Resend account + verified sending domain (see "Sending enquiry emails"
  above) — until that's done, enquiries save to D1 but no email goes out
- Real hero/tour/gallery imagery (placeholders reference `/images/...`
  paths that don't exist yet) — feed through the existing WebP/mozjpeg
  pipeline before dropping into `public/images/`
- Content migration from the Joomla export (tours, blog posts, Irish flag
  page, Saint Audoen's Arch, Cobh, Hy Brasil, etc.) — blog schema and the
  Joomla → Markdown migration script (`scripts/migrate-joomla-blog.mjs`) are
  built; the ~25 SP Page Builder region/landing pages (Home, Dublin, etc.)
  still need their own JSON-based parser once we've seen a real export
- 301 redirect map from the old Joomla URLs (a URL-mapping script already
  exists from the earlier planning pass — reuse it against the sitemap)

**Later:**

- Regions content collection + `/regions/[slug]` hub template, once the
  Home/Dublin SPPB JSON has been reviewed
- Schema.org markup per tour/blog page (JSON-LD)
- EAA/WCAG audit pass once real content and images are in
