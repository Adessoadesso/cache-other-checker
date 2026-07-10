/**
 * Releases any availability_slots hold that's past its held_until.
 *
 * Two hold lifecycles feed into this:
 *  - Stripe checkout holds (src/pages/api/checkout.ts): ~15 minutes.
 *  - Manual/admin "requested" bookings (src/pages/admin/api/availability/[id]/book.ts): 72 hours.
 *
 * If a 'requested' booking is still sitting on a slot when its hold expires,
 * staff never got to it in time — auto-decline it (rather than leaving it
 * silently orphaned) and free the slot back to 'open'. Confirmed/paid
 * bookings are untouched; held_until only matters pre-confirmation.
 */
export async function releaseExpiredHolds(env: { DB: D1Database }) {
  const { results: expiredSlots } = await env.DB.prepare(
    `SELECT id FROM availability_slots
     WHERE status = 'held' AND held_until IS NOT NULL AND held_until < datetime('now')`
  ).all<{ id: string }>();

  if (expiredSlots.length === 0) {
    return { released: 0 };
  }

  const statements = [];
  for (const slot of expiredSlots) {
    statements.push(
      env.DB.prepare(
        "UPDATE bookings SET status = 'declined', notes = COALESCE(notes || ' ', '') || '[auto-declined: hold expired]', updated_at = datetime('now') WHERE slot_id = ? AND status = 'requested'"
      ).bind(slot.id)
    );
    statements.push(
      env.DB.prepare(
        "UPDATE availability_slots SET status = 'open', held_until = NULL WHERE id = ?"
      ).bind(slot.id)
    );
  }
  await env.DB.batch(statements);

  return { released: expiredSlots.length };
}
