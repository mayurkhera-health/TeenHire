-- ── §34: the handoff ────────────────────────────────────────────────────────
-- An employer says it wants to talk, and until now nothing happened: both
-- sides were told to check their email and no message contained a way to
-- reach the other. The loop the whole product exists to close stopped here.
--
-- The direction is the decision. The student receives the organization's
-- contact; the organization never receives the student's. A minor's address
-- is not handed to an adult who pressed a button — the student decides
-- whether to make contact, and may decide not to.
--
-- The employer signup has always asked "Your name" and the answer was
-- discarded: there was no column for it. It matters here. Calling a business
-- cold is hard at sixteen, and "ask for Sam" is a different phone call from
-- "ask for whoever handles hiring".

ALTER TABLE organizations ADD COLUMN contact_name text NOT NULL DEFAULT '';
