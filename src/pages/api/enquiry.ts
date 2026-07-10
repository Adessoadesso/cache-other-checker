import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

/**
 * The contact form lives on the STATIC cPanel-hosted site and posts here as
 * a plain HTML form submission (no JS, no fetch) — so this is a normal
 * cross-origin navigation, not a CORS-governed request. The browser follows
 * the 303 redirect back to the static site's own /contact?sent=1 page.
 *
 * If the form is later enhanced with client-side JS (inline validation,
 * no full-page reload), THAT would need explicit CORS headers here
 * (Access-Control-Allow-Origin: https://panoramicireland.com, handling the
 * OPTIONS preflight) — plain form posts don't need any of that.
 */
export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();

  const name = String(form.get('name') ?? '').trim();
  const email = String(form.get('email') ?? '').trim();
  const phone = form.get('phone') ? String(form.get('phone')) : null;
  const message = String(form.get('message') ?? '').trim();
  const preferredDates = form.get('dates') ? String(form.get('dates')) : null;
  const guestCount = form.get('guestCount') ? Number(form.get('guestCount')) : null;
  const sourcePage = form.get('sourcePage') ? String(form.get('sourcePage')) : null;

  if (!name || !email || !message) {
    return new Response('Name, email, and message are required', { status: 400 });
  }

  const id = crypto.randomUUID();

  if (env.DB) {
    await env.DB.prepare(
      `INSERT INTO enquiries (id, name, email, phone, message, preferred_dates, guest_count, source_page)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(id, name, email, phone, message, preferredDates, guestCount, sourcePage)
      .run();
  }

  if (env.RESEND_API_KEY && env.ENQUIRY_TO_EMAIL) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: env.ENQUIRY_FROM_EMAIL ?? 'Panoramic Ireland <enquiries@panoramicireland.com>',
          to: [env.ENQUIRY_TO_EMAIL],
          reply_to: email,
          subject: `New enquiry — ${name}`,
          text: [
            `Name: ${name}`,
            `Email: ${email}`,
            phone ? `Phone: ${phone}` : null,
            preferredDates ? `Preferred dates: ${preferredDates}` : null,
            guestCount ? `Guest count: ${guestCount}` : null,
            '',
            message,
          ]
            .filter(Boolean)
            .join('\n'),
        }),
      });
      if (!res.ok) {
        console.error('Resend send failed', res.status, await res.text());
      }
    } catch (err) {
      // Don't fail the whole request over email — the enquiry is already
      // saved in D1 above, so nothing is lost, just not yet emailed.
      console.error('Resend send threw', err);
    }
  } else {
    console.warn('RESEND_API_KEY / ENQUIRY_TO_EMAIL not configured — enquiry saved to D1 only');
  }

  return redirect('https://panoramicireland.com/contact?sent=1', 303);
};
