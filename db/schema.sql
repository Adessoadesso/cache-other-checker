-- panoramicireland D1 schema
-- Apply with: wrangler d1 execute panoramicireland-db --file=./db/schema.sql

-- General contact-form enquiries — not tied to a specific slot/tour the way
-- `bookings` is. Deliberately a bit wider than today's simple form needs:
-- the core fields cover what the form currently asks, `tour_interest` and
-- `preferred_dates` are nullable for when the form grows those inputs, and
-- `extra` is a JSON catch-all so a new field can be added to the form and
-- captured immediately without a migration — promote it to a real column
-- later if it turns out to matter for querying/reporting.
CREATE TABLE IF NOT EXISTS enquiries (
  id TEXT PRIMARY KEY,           -- uuid
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  message TEXT NOT NULL,
  tour_interest TEXT,            -- free text or a tour slug, once the form captures it
  preferred_dates TEXT,
  guest_count INTEGER,
  source_page TEXT,              -- which page the form was submitted from
  extra TEXT,                    -- JSON blob for future fields
  status TEXT NOT NULL DEFAULT 'new', -- new | replied | archived
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_enquiries_status ON enquiries(status);


CREATE TABLE IF NOT EXISTS tours (
  id TEXT PRIMARY KEY,           -- slug, e.g. 'connemara-wild-atlantic'
  title TEXT NOT NULL,
  region TEXT NOT NULL,          -- e.g. 'Connemara', 'Dublin', 'Causeway Coast'
  duration_hours INTEGER NOT NULL,
  base_price_eur INTEGER NOT NULL,   -- store in cents
  max_guests INTEGER NOT NULL DEFAULT 6,
  active INTEGER NOT NULL DEFAULT 1, -- boolean
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One row per bookable slot. Source of truth is Google Calendar;
-- this table is a cache/lock layer to prevent double-booking during checkout.
CREATE TABLE IF NOT EXISTS availability_slots (
  id TEXT PRIMARY KEY,           -- uuid
  tour_id TEXT NOT NULL REFERENCES tours(id),
  gcal_event_id TEXT,            -- Google Calendar event id once confirmed
  starts_at TEXT NOT NULL,       -- ISO 8601
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', -- open | held | booked | cancelled
  held_until TEXT,               -- soft lock expiry during Stripe checkout
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_slots_tour_status ON availability_slots(tour_id, status);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,           -- uuid
  slot_id TEXT NOT NULL REFERENCES availability_slots(id),
  tour_id TEXT NOT NULL REFERENCES tours(id),
  guest_name TEXT NOT NULL,
  guest_email TEXT NOT NULL,
  guest_phone TEXT,
  guest_count INTEGER NOT NULL DEFAULT 1,
  amount_eur INTEGER NOT NULL,       -- cents
  -- Set once a payment mechanism actually processes this booking. NULL while
  -- 'requested'/'confirmed' under the manual-payment-link phase.
  payment_provider TEXT,             -- manual | sumup | stripe
  payment_reference TEXT,            -- provider-specific id (Stripe session id, SumUp checkout id, etc.)
  stripe_payment_intent_id TEXT,
  stripe_checkout_session_id TEXT,
  -- requested: customer/staff-entered, awaiting admin confirm (holds the slot)
  -- confirmed: on the calendar, awaiting payment (manual link or automated checkout)
  -- paid: payment received
  -- declined: admin declined a request; slot released back to open
  -- cancelled: a confirmed/paid booking cancelled after the fact
  status TEXT NOT NULL DEFAULT 'requested',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_email ON bookings(guest_email);

CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,           -- stripe event id, for idempotency
  type TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  payload TEXT
);
