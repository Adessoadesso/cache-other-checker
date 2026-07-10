import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

export const POST: APIRoute = async ({ params, request }) => {
  const { id: slotId } = params;
  const form = await request.formData();

  const guestName = String(form.get('guestName') ?? '').trim();
  const guestEmail = String(form.get('guestEmail') ?? '').trim();
  const guestPhone = form.get('guestPhone') ? String(form.get('guestPhone')) : null;
  const guestCount = Number(form.get('guestCount') ?? 1);
  const amountEur = Math.round(Number(form.get('amountEur') ?? 0) * 100);
  const notes = form.get('notes') ? String(form.get('notes')) : null;

  if (!guestName || !guestEmail) {
    return new Response('Guest name and email are required', { status: 400 });
  }

  const slot = await env.DB.prepare('SELECT * FROM availability_slots WHERE id = ?').bind(slotId).first<any>();
  if (!slot) {
    return new Response('Slot not found', { status: 404 });
  }
  if (slot.status !== 'open') {
    return new Response('Slot is no longer open', { status: 409 });
  }

  const bookingId = crypto.randomUUID();
  // Manually-entered requests are held generously (staff still needs to confirm
  // and send a payment link) rather than the short Stripe-checkout-style hold.
  const heldUntil = new Date(Date.now() + 72 * 60 * 60_000).toISOString();

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO bookings (id, slot_id, tour_id, guest_name, guest_email, guest_phone, guest_count, amount_eur, status, notes, payment_provider)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'requested', ?, 'manual')`
    ).bind(bookingId, slotId, slot.tour_id, guestName, guestEmail, guestPhone, guestCount, amountEur, notes),
    env.DB.prepare("UPDATE availability_slots SET status = 'held', held_until = ? WHERE id = ?").bind(
      heldUntil,
      slotId
    ),
  ]);

  return new Response(null, {
    status: 303,
    headers: { Location: `/admin/bookings/${bookingId}` },
  });
};
