-- Phase 0 — identity, the write path, and the event log.
--
-- Everything the product does on a student's behalf needs an owner, and until
-- now nothing had one: profiles, saves and expressions of interest all lived
-- in one browser. These tables are what let an employer and a student be two
-- different people on two different devices.

-- ── Identity ────────────────────────────────────────────────────────────────
-- One row per person, whatever they are here to do. Role-specific detail lives
-- in its own table so a student profile and an organization membership never
-- have to share a shape.

CREATE TABLE users (
  id             text PRIMARY KEY,
  -- Normalised before storage, so one person is one account however they type
  -- their address. The unique constraint is what enforces it.
  contact        text NOT NULL UNIQUE,
  contact_method text NOT NULL CHECK (contact_method IN ('email','phone','google','apple')),
  role           text NOT NULL DEFAULT 'student' CHECK (role IN ('student','org','admin')),
  verified_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- The code is hashed. A database dump must not hand anyone a working login,
-- and nothing in the system ever needs to read a code back.
CREATE TABLE auth_challenges (
  id             text PRIMARY KEY,
  contact        text NOT NULL,
  contact_method text NOT NULL CHECK (contact_method IN ('email','phone')),
  code_hash      text NOT NULL,
  expires_at     timestamptz NOT NULL,
  attempts_left  smallint NOT NULL DEFAULT 5 CHECK (attempts_left >= 0),
  -- Set the moment a challenge succeeds or burns out. A consumed challenge can
  -- never be retried, even with the code that was always correct.
  consumed_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_challenges_contact_idx ON auth_challenges (contact, created_at DESC);

-- Sessions are rows rather than self-contained tokens so signing out actually
-- ends something. Only the hash is stored; the cookie holds the secret.
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

-- ── Students ────────────────────────────────────────────────────────────────
-- search_location is the private one. §13: it is never joined into anything an
-- organization can read, and no view in this schema exposes it.

CREATE TABLE students (
  user_id          text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  first_name       text NOT NULL DEFAULT '',
  age              smallint NOT NULL CHECK (age BETWEEN 13 AND 21),
  search_location  geography(Point, 4326) NOT NULL,
  search_city      text NOT NULL DEFAULT '',
  search_zip       text NOT NULL DEFAULT '',
  radius_miles     smallint NOT NULL CHECK (radius_miles BETWEEN 1 AND 100),
  types            text[] NOT NULL DEFAULT '{}',
  availability     text[] NOT NULL DEFAULT '{}',
  interests        text[] NOT NULL DEFAULT '{}',
  transportation   text[] NOT NULL DEFAULT '{}',
  skills           text[] NOT NULL DEFAULT '{}',
  things_done      text[] NOT NULL DEFAULT '{}',
  has_similar_experience boolean,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX students_location_idx ON students USING GIST (search_location);
CREATE INDEX students_age_idx ON students (age);

-- ── The severed link ────────────────────────────────────────────────────────
-- An expression of interest, which until now never left the browser it was
-- made in. The unique constraint is what stops a double-tap sending twice.

CREATE TABLE applications (
  id              text PRIMARY KEY,
  student_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opportunity_id  text NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'INTERESTED'
                  CHECK (status IN ('INTERESTED','VIEWED','EMPLOYER_INTERESTED',
                                    'NOT_SELECTED','WITHDRAWN','HIRED')),
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_user_id, opportunity_id)
);
CREATE INDEX applications_opportunity_idx ON applications (opportunity_id, created_at DESC);
CREATE INDEX applications_student_idx ON applications (student_user_id, created_at DESC);

CREATE TABLE saved_opportunities (
  student_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opportunity_id  text NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_user_id, opportunity_id)
);

-- ── Organization membership ─────────────────────────────────────────────────
-- Separate from organizations on purpose. §35 requires an admin to create an
-- organization record with no account attached to it; keeping membership in
-- its own table is what makes that possible without a null-littered column.

CREATE TABLE org_members (
  user_id         text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role            text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner','member')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, organization_id)
);
CREATE INDEX org_members_org_idx ON org_members (organization_id);

-- ── Events ──────────────────────────────────────────────────────────────────
-- One append-only table serves the §47 funnels, the §39 marketplace metrics
-- and §50's audit requirement. Kept here rather than sent to a third party:
-- it is less code than an SDK, and behavioural data about minors stays on
-- infrastructure we control.

CREATE TABLE events (
  id              bigserial PRIMARY KEY,
  name            text NOT NULL,
  user_id         text REFERENCES users(id) ON DELETE SET NULL,
  organization_id text REFERENCES organizations(id) ON DELETE SET NULL,
  opportunity_id  text REFERENCES opportunities(id) ON DELETE SET NULL,
  props           jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX events_name_time_idx ON events (name, created_at DESC);
CREATE INDEX events_user_idx ON events (user_id, created_at DESC);
CREATE INDEX events_opportunity_idx ON events (opportunity_id, created_at DESC);

-- ── Opportunity provenance (§37) ────────────────────────────────────────────
-- Needed from the first admin-created posting, so that the pilot can tell
-- self-service supply from supply we went out and fetched. Never returned to
-- a student-facing query.

ALTER TABLE opportunities
  ADD COLUMN created_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN creation_method    text NOT NULL DEFAULT 'SEED'
                                CHECK (creation_method IN
                                  ('EMPLOYER_SELF_SERVICE','ADMIN_ASSISTED','SEED')),
  ADD COLUMN source_type        text,
  ADD COLUMN source_reference   text,
  ADD COLUMN internal_notes     text;
