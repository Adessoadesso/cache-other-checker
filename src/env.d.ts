/// <reference types="astro/client" />

// Astro 6 + @astrojs/cloudflare v13 run on real workerd: bindings are read via
// `import { env } from 'cloudflare:workers'` rather than `Astro.locals.runtime.env`.
// This augments the ambient `Cloudflare.Env` interface that import is typed against.
// Once you have a real Cloudflare account, prefer running `wrangler types` to generate
// this automatically from wrangler.toml instead of hand-maintaining it.
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    STRIPE_SECRET_KEY: string;
    STRIPE_WEBHOOK_SECRET: string;
    GOOGLE_CALENDAR_CLIENT_EMAIL: string;
    GOOGLE_CALENDAR_PRIVATE_KEY: string;
    GOOGLE_CALENDAR_ID: string;
    PUBLIC_SITE_URL: string;
    // Cloudflare Access — see README "Admin panel setup"
    CF_ACCESS_TEAM_DOMAIN: string; // e.g. "panoramicireland.cloudflareaccess.com"
    CF_ACCESS_AUD: string; // the Access application's "Audience (AUD) Tag"
    // Contact-form email — see README "Sending enquiry emails"
    RESEND_API_KEY: string;
    ENQUIRY_TO_EMAIL: string;
    ENQUIRY_FROM_EMAIL: string;
  }
}

declare module 'cloudflare:workers' {
  export const env: Cloudflare.Env;
}

declare namespace App {
  interface Locals {
    adminEmail?: string;
  }
}
