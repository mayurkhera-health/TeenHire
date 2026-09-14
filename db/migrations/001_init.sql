-- TeenHire V1 — organizations, opportunities and their timing.
--
-- Deliberately small (§56). Fields that drive searching, eligibility, matching
-- or safety are real columns with real constraints; everything else is JSON or
-- an array, because normalising it would buy nothing but tables.
--
-- Students and applications are not here yet. They arrive with identity, and a
-- schema for them written before that decision would be a guess.

CREATE EXTENSION IF NOT EXISTS postgis;

-- Status vocabularies are CHECK constraints rather than Postgres enums.
-- Same guarantee, but adding a value later is an ordinary migration instead of
-- an ALTER TYPE that locks the table — and it ports to any managed Postgres.

CREATE TABLE organizations (
  id                  text PRIMARY KEY,
  name                text NOT NULL,
  kind                text NOT NULL CHECK (kind IN ('business', 'nonprofit')),
  -- A lifecycle, not a flag. Nothing reaches a student unless this is VERIFIED,
  -- and only a human moves it there.
  verification_status text NOT NULL DEFAULT 'UNVERIFIED'
                      CHECK (verification_status IN
                             ('UNVERIFIED','PENDING','VERIFIED','REJECTED','SUSPENDED')),
  website             text,
  phone               text,
  about               text NOT NULL DEFAULT '',
  city                text NOT NULL,
  zip                 text NOT NULL,
  -- geography, not geometry: ST_DWithin then works in metres on a sphere
  -- rather than in degrees, which is the whole reason distance is trustworthy.
  location            geography(Point, 4326) NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE opportunities (
  id               text PRIMARY KEY,
  organization_id  text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title            text NOT NULL,
  type             text NOT NULL CHECK (type IN ('paid','internship','volunteer')),
  status           text NOT NULL DEFAULT 'DRAFT'
                   CHECK (status IN ('DRAFT','PENDING_REVIEW','PUBLISHED','PAUSED',
                                     'FILLED','EXPIRED','REJECTED')),
  -- A real column because it decides eligibility before anything is ranked.
  minimum_age      smallint NOT NULL CHECK (minimum_age BETWEEN 14 AND 21),
  experience       text NOT NULL CHECK (experience IN ('none','some','required')),
  hours            text CHECK (hours IN ('under_10','10_20','20_plus','varies')),
  -- Pay drives no filter and no match, so it stays shaped rather than spread
  -- across columns. The application layer owns which shape each type allows.
  compensation     jsonb NOT NULL,
  summary          text NOT NULL DEFAULT '',
  reassurance      text NOT NULL DEFAULT '',
  responsibilities text[] NOT NULL DEFAULT '{}',
  schedule         text NOT NULL DEFAULT '',
  good_to_know     text[] NOT NULL DEFAULT '{}',
  interests        text[] NOT NULL DEFAULT '{}',
  published_at     timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Timing is an attribute, never a type (§5/§12). Its own table because it is a
-- matching filter, so it has to be joinable and indexable.
CREATE TABLE opportunity_timing (
  opportunity_id text NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  timing         text NOT NULL CHECK (timing IN
                   ('after_school','weekends','summer','winter_break',
                    'spring_break','seasonal','year_round','flexible')),
  PRIMARY KEY (opportunity_id, timing)
);

-- The feed's query is: published, verified, old enough, within range. Each of
-- those gets an index, because that query runs on every visit.
CREATE INDEX organizations_location_idx ON organizations USING GIST (location);
CREATE INDEX organizations_verified_idx ON organizations (verification_status);
CREATE INDEX opportunities_live_idx ON opportunities (status, minimum_age);
CREATE INDEX opportunities_org_idx ON opportunities (organization_id);
CREATE INDEX opportunities_published_at_idx ON opportunities (published_at DESC);
CREATE INDEX opportunities_interests_idx ON opportunities USING GIN (interests);
CREATE INDEX opportunity_timing_idx ON opportunity_timing (timing);
