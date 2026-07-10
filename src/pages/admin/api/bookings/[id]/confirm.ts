import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { createBookingEvent } from '../../../../../lib/calendar';

export const prerender = false;

export const POST: APIRoute = async ({ params, redirect }) => {
  const { id } = params;

  const booking = await env.DB.prepare(
    `SELECT b.*, t.title as tour_title, s.starts_at, s.ends_at
     FROM bookings b
     JOIN tours t ON t.id = b.tour_id
     JOIN availability_slots s ON s.id = b.slot_id
     WHERE b.id = ?`
  )
    .bind(id)
    .first<any>();

  if (!booking) {
    return new Response('Booking not found', { status: 404 });
  }
  if (booking.status !== 'requested') {
    return redirect(`/admin/bookings/${id}`, 303);
  }

  let gcalEventId: string | null = null;
  if (env.GOOGLE_CALENDAR_CLIENT_EMAIL) {
    const gcalEvent = await createBookingEvent(
      {
        clientEmail: env.GOOGLE_CALENDAR_CLIENT_EMAIL,
        privateKey: env.GOOGLE_CALENDAR_PRIVATE_KEY,
        calendarId: env.GOOGLE_CALENDAR_ID,
      },
      {
        summary: `${booking.tour_title} — ${booking.guest_name} (${booking.guest_count} guests)`,
        description: `Booking ${booking.id}\nEmail: ${booking.guest_email}\nPhone: ${booking.guest_phone ?? '—'}\nStatus: awaiting payment`,
        startISO: booking.starts_at,
        endISO: booking.ends_at,
      }
    );
    gcalEventId = gcalEvent.id ?? null;
  }

  await env.DB.batch([
    env.DB.prepare("UPDATE bookings SET status = 'confirmed', updated_at = datetime('now') WHERE id = ?").bind(id),
    env.DB.prepare("UPDATE availability_slots SET status = 'booked', gcal_event_id = ? WHERE id = ?").bind(
      gcalEventId,
      booking.slot_id
    ),
  ]);

  return redirect(`/admin/bookings/${id}`, 303);
};
