-- ── Phase 4: notification delivery ──────────────────────────────────────────
-- Composition and the rules about who may hear what have existed since the
-- first release and are covered by unit tests. What was missing was everything
-- that makes a message leave the building.

-- ── Preferences move to the server ─────────────────────────────────────────
-- They lived in localStorage, which was fine while nothing sent anything: the
-- browser was the only thing that ever read them. A server-side sender cannot
-- see localStorage, so "off means off" — a property the tests already assert —
-- would have been silently violated by the first real send. Preferences belong
-- wherever the decision to send is made.
--
-- On students rather than users because in this release the student is the
-- only audience with a choice. An organization hearing that somebody applied
-- to its own posting is transactional: it is the thing they asked for by
-- posting. If that changes, this moves to its own table keyed by user_id.

ALTER TABLE students
  ADD COLUMN notify_types     text[] NOT NULL DEFAULT '{paid,internship,volunteer}',
  ADD COLUMN notify_frequency text   NOT NULL DEFAULT 'daily'
    CHECK (notify_frequency IN ('immediately','daily','weekly','off'));

-- ── The delivery log ───────────────────────────────────────────────────────
-- Every message that was composed, whether or not it left. Three jobs:
--
--   1. Dedupe. dedupe_key is unique, so a retried trigger, a double-click or a
--      worker that crashed after sending cannot produce a second message. The
--      constraint is the guard; no caller has to remember to check.
--   2. Retry. A transient provider failure is not a lost message — status and
--      next_attempt_at are what the worker reads.
--   3. Evidence. §61 wants to know whether notifications actually drive
--      return visits, which is unanswerable without a record of what was sent.
--
-- The body is stored. Messages never describe the student (a unit test proves
-- it), so this holds nothing about a minor that the opportunity itself does
-- not already say publicly.

CREATE TABLE notification_deliveries (
  id            text PRIMARY KEY,
  dedupe_key    text NOT NULL UNIQUE,
  user_id       text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event         text NOT NULL,
  channel       text NOT NULL CHECK (channel IN ('EMAIL','SMS')),
  -- Where it actually went, kept alongside the message: a contact changed
  -- later must not rewrite the history of what was already delivered.
  to_method     text NOT NULL CHECK (to_method IN ('email','sms')),
  to_contact    text NOT NULL,
  subject       text NOT NULL DEFAULT '',
  body          text NOT NULL,
  status        text NOT NULL DEFAULT 'QUEUED'
                  CHECK (status IN ('QUEUED','SENT','FAILED','SUPPRESSED')),
  attempts      smallint NOT NULL DEFAULT 0,
  last_error    text,
  provider      text,
  provider_message_id text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  sent_at       timestamptz
);

-- What the worker asks for: anything still owed, oldest first.
CREATE INDEX notification_deliveries_due_idx
  ON notification_deliveries (next_attempt_at)
  WHERE status IN ('QUEUED','FAILED');

CREATE INDEX notification_deliveries_user_idx
  ON notification_deliveries (user_id, created_at DESC);
