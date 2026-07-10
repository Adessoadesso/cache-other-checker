import type { APIRoute } from 'astro';
import { z } from 'zod';
import { env } from 'cloudflare:workers';
import { getStripeClient } from '../../lib/stripe';

export const prerender = false;

const CheckoutSchema = z.object({
  slotId: z.string().uuid(),
  tourId: z.string(),
  guestName: z.string().min(1),
  guestEmail: z.string().email(),
  guestPhone: z.string().optional(),
  guestCount: z.number().int().min(1).max(12),
});

export const POST: APIRoute = async ({ request }) => {
  if (!env?.DB || !env?.STRIPE_SECRET_KEY) {
    return new Response(JSON.stringify({ error: 'Server not configured' }), { status: 500 });
  }

  const body = await request.json().catch(() => null);
  const parsed = CheckoutSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
  }
  const { slotId, tourId, guestName, guestEmail, guestPhone, guestCount } = parsed.data;

  const slot = await env.DB.prepare(
    'SELECT * FROM availability_slots WHERE id = ? AND tour_id = ?'
  )
    .bind(slotId, tourId)
    .first();

  if (!slot || slot.status !== 'open') {
    return new Response(JSON.stringify({ error: 'Slot is no longer available' }), { status: 409 });
  }

  const tour = await env.DB.prepare('SELECT * FROM tours WHERE id = ?').bind(tourId).first();
  if (!tour) {
    return new Response(JSON.stringify({ error: 'Tour not found' }), { status: 404 });
  }

  const holdMinutes = 15;
  const heldUntil = new Date(Date.now() + holdMinutes * 60_000).toISOString();

  // Soft-lock the slot for the checkout window; a scheduled worker should
  // sweep expired holds back to 'open'.
  await env.DB.prepare(
    "UPDATE availability_slots SET status = 'held', held_until = ? WHERE id = ? AND status = 'open'"
  )
    .bind(heldUntil, slotId)
    .run();

  const bookingId = crypto.randomUUID();
  const amountEur = tour.base_price_eur as number;

  await env.DB.prepare(
    `INSERT INTO bookings (id, slot_id, tour_id, guest_name, guest_email, guest_phone, guest_count, amount_eur, status, payment_provider)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'requested', 'stripe')`
  )
    .bind(bookingId, slotId, tourId, guestName, guestEmail, guestPhone ?? null, guestCount, amountEur)
    .run();

  const stripe = getStripeClient(env.STRIPE_SECRET_KEY);
  const origin = new URL(request.url).origin;

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: guestEmail,
    line_items: [
      {
        price_data: {
          currency: 'eur',
          unit_amount: amountEur,
          product_data: { name: `${tour.title} — ${guestCount} guest(s)` },
        },
        quantity: 1,
      },
    ],
    metadata: { bookingId, slotId, tourId },
    success_url: `${origin}/booking/confirmed?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/tours/${tourId}?cancelled=1`,
  });

  await env.DB.prepare('UPDATE bookings SET stripe_checkout_session_id = ? WHERE id = ?')
    .bind(session.id, bookingId)
    .run();

  return new Response(JSON.stringify({ checkoutUrl: session.url }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
