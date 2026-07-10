import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getStripeClient } from '../../../lib/stripe';
import { createBookingEvent } from '../../../lib/calendar';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (!env?.DB || !env?.STRIPE_SECRET_KEY || !env?.STRIPE_WEBHOOK_SECRET) {
    return new Response('Server not configured', { status: 500 });
  }

  const signature = request.headers.get('stripe-signature');
  const payload = await request.text();
  if (!signature) {
    return new Response('Missing signature', { status: 400 });
  }

  const stripe = getStripeClient(env.STRIPE_SECRET_KEY);
  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(payload, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return new Response(`Webhook signature verification failed: ${(err as Error).message}`, { status: 400 });
  }

  // Idempotency: ignore events we've already recorded.
  const existing = await env.DB.prepare('SELECT id FROM webhook_events WHERE id = ?').bind(event.id).first();
  if (existing) {
    return new Response('ok', { status: 200 });
  }
  await env.DB.prepare('INSERT INTO webhook_events (id, type, payload) VALUES (?, ?, ?)')
    .bind(event.id, event.type, payload)
    .run();

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as any;
    const { bookingId, slotId, tourId } = session.metadata ?? {};
    if (bookingId && slotId) {
      await env.DB.prepare(
        "UPDATE bookings SET status = 'paid', stripe_payment_intent_id = ?, payment_reference = ?, updated_at = datetime('now') WHERE id = ?"
      )
        .bind(session.payment_intent, session.payment_intent, bookingId)
        .run();

      const slot = await env.DB.prepare('SELECT * FROM availability_slots WHERE id = ?').bind(slotId).first();
      const booking = await env.DB.prepare('SELECT * FROM bookings WHERE id = ?').bind(bookingId).first();
      const tour = await env.DB.prepare('SELECT * FROM tours WHERE id = ?').bind(tourId).first();

      if (slot && booking && tour && env.GOOGLE_CALENDAR_CLIENT_EMAIL) {
        const gcalEvent = await createBookingEvent(
          {
            clientEmail: env.GOOGLE_CALENDAR_CLIENT_EMAIL,
            privateKey: env.GOOGLE_CALENDAR_PRIVATE_KEY,
            calendarId: env.GOOGLE_CALENDAR_ID,
          },
          {
            summary: `${tour.title} — ${booking.guest_name} (${booking.guest_count} guests)`,
            description: `Booking ${bookingId}\nEmail: ${booking.guest_email}\nPhone: ${booking.guest_phone ?? '—'}`,
            startISO: slot.starts_at,
            endISO: slot.ends_at,
          }
        );

        await env.DB.prepare(
          "UPDATE availability_slots SET status = 'booked', gcal_event_id = ? WHERE id = ?"
        )
          .bind(gcalEvent.id, slotId)
          .run();
      }
    }
  }

  return new Response('ok', { status: 200 });
};
