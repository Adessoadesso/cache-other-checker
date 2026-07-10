import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

export const POST: APIRoute = async ({ params, redirect }) => {
  const { id } = params;

  const booking = await env.DB.prepare('SELECT * FROM bookings WHERE id = ?').bind(id).first<any>();
  if (!booking) {
    return new Response('Booking not found', { status: 404 });
  }
  if (booking.status !== 'requested') {
    return redirect(`/admin/bookings/${id}`, 303);
  }

  await env.DB.batch([
    env.DB.prepare("UPDATE bookings SET status = 'declined', updated_at = datetime('now') WHERE id = ?").bind(id),
    env.DB.prepare("UPDATE availability_slots SET status = 'open', held_until = NULL WHERE id = ?").bind(
      booking.slot_id
    ),
  ]);

  return redirect(`/admin/bookings/${id}`, 303);
};
