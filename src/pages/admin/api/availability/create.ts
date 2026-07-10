import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const tourId = String(form.get('tourId') ?? '');
  const startsAt = String(form.get('starts_at') ?? '');
  const endsAt = String(form.get('ends_at') ?? '');

  if (!tourId || !startsAt || !endsAt) {
    return new Response('Missing fields', { status: 400 });
  }

  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO availability_slots (id, tour_id, starts_at, ends_at, status)
     VALUES (?, ?, ?, ?, 'open')`
  )
    .bind(id, tourId, startsAt, endsAt)
    .run();

  return redirect(`/admin/availability/${tourId}`, 303);
};
