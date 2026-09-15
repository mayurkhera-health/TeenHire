-- Phase 2 — the operator.
--
-- Until now PENDING_REVIEW was a terminal state: the schema knew how to hold a
-- pending organization and the queries knew to hide it, but nothing in the
-- system could ever move it. This adds the person who can, and the record of
-- what they did.

-- §50: admin actions must be auditable. Kept apart from `events` on purpose —
-- events are analytics and can be trimmed or sampled one day; this is the
-- record of who decided that an organization was safe to put in front of
-- minors, and it is never trimmed.
CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  actor_id    text REFERENCES users(id) ON DELETE SET NULL,
  -- Kept as text as well as a reference: if the account is ever deleted the
  -- decision must still say who made it.
  actor_label text NOT NULL,
  action      text NOT NULL,
  subject_type text NOT NULL CHECK (subject_type IN ('organization','opportunity','student')),
  subject_id  text NOT NULL,
  detail      jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_subject_idx ON audit_log (subject_type, subject_id, created_at DESC);
CREATE INDEX audit_log_actor_idx ON audit_log (actor_id, created_at DESC);

-- Why an organization was rejected or suspended, in the admin's own words.
-- Students never see this; the organization eventually should.
ALTER TABLE organizations
  ADD COLUMN verification_note text,
  ADD COLUMN verified_at       timestamptz,
  ADD COLUMN verified_by       text REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN internal_notes    text;
