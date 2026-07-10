import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

const ALLOWED = new Set(['open', 'cancelled']);

export const POST: APIRoute = async ({ params, request }) => {
  const { id } = params;
  const form = await request.formData();
  const status = String(form.get('status') ?? '');

  if (!ALLOWED.has(status)) {
    return new Response('Invalid status', { status: 400 });
  }

  const slot = await env.DB.prepare('SELECT * FROM availability_slots WHERE id = ?').bind(id).first<any>();
  if (!slot) {
    return new Response('Slot not found', { status: 404 });
  }
  // Don't let a manual status change silently orphan an active booking —
  // held/booked slots need to go through the bookings queue (decline/confirm).
  if (slot.status === 'held' || slot.status === 'booked') {
    return new Response('This slot has an active booking — manage it from the Bookings queue instead.', {
      status: 409,
    });
  }

  await env.DB.prepare('UPDATE availability_slots SET status = ?, held_until = NULL WHERE id = ?')
    .bind(status, id)
    .run();

  return new Response(null, {
    status: 303,
    headers: { Location: `/admin/availability/${slot.tour_id}` },
  });
};
