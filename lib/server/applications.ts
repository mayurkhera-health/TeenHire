import { randomBytes } from 'node:crypto';
import { query } from '../db';
import type { ApplicationStatus, Interest, Timing } from '../types';

/* Expressions of interest — the link that did not exist.
 *
 * Two queries matter here and they are deliberately different shapes. A
 * student reads their own applications and may see everything. An organization
 * reads the students interested in one of its postings and may see a fixed,
 * narrow set of columns — §33's envelope, enforced by the SELECT list rather
 * than by a component remembering to omit things.
 *
 * The student's search coordinates are never in either result. Distance is
 * computed inside the query and only the number comes out. */

const id = () => `app_${randomBytes(9).toString('base64url')}`;

export type CreateOutcome =
  | { ok: true; applicationId: string; alreadySent: boolean }
  | { ok: false; error: string };

/* Eligibility is re-checked here against the database. The client already
   knows the answer, but the client is not in a position to be believed. */
export async function createInterest(
  studentUserId: string,
  opportunityId: string,
  note: string | null,
): Promise<CreateOutcome> {
  const [check] = await query<{
    eligible: boolean;
    reason: string | null;
    organization_id: string;
  }>(
    `SELECT
       (o.status = 'PUBLISHED'
        AND org.verification_status = 'VERIFIED'
        AND o.minimum_age <= s.age
        AND ST_DWithin(org.location, s.search_location, s.radius_miles * 1609.344)) AS eligible,
       CASE
         WHEN o.status <> 'PUBLISHED' THEN 'This one is no longer open'
         WHEN org.verification_status <> 'VERIFIED' THEN 'This one is no longer open'
         WHEN o.minimum_age > s.age THEN 'This one needs you to be ' || o.minimum_age || ' or older'
         ELSE 'This one is outside the area you search'
       END AS reason,
       o.organization_id
     FROM opportunities o
     JOIN organizations org ON org.id = o.organization_id
     JOIN students s ON s.user_id = $1
     WHERE o.id = $2`,
    [studentUserId, opportunityId],
  );

  if (!check) return { ok: false, error: 'That opportunity no longer exists' };
  if (!check.eligible) return { ok: false, error: check.reason ?? 'This one is not open to you' };

  /* A second tap is not a second application. The unique constraint is the
     real guard; this returns the existing row rather than an error, because a
     student who taps twice has not done anything wrong. */
  const [existing] = await query<{ id: string }>(
    `SELECT id FROM applications
     WHERE student_user_id = $1 AND opportunity_id = $2 AND status <> 'WITHDRAWN'`,
    [studentUserId, opportunityId],
  );
  if (existing) return { ok: true, applicationId: existing.id, alreadySent: true };

  const applicationId = id();
  await query(
    `INSERT INTO applications (id, student_user_id, opportunity_id, note)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (student_user_id, opportunity_id) DO UPDATE
       SET status = 'INTERESTED', note = EXCLUDED.note, updated_at = now()`,
    [applicationId, studentUserId, opportunityId, note],
  );
  return { ok: true, applicationId, alreadySent: false };
}

export async function withdrawInterest(studentUserId: string, opportunityId: string): Promise<void> {
  await query(
    `UPDATE applications SET status = 'WITHDRAWN', updated_at = now()
     WHERE student_user_id = $1 AND opportunity_id = $2`,
    [studentUserId, opportunityId],
  );
}

export interface StudentApplication {
  opportunityId: string;
  status: ApplicationStatus;
  note: string | null;
  createdAt: string;
}

export async function loadApplications(studentUserId: string): Promise<StudentApplication[]> {
  const rows = await query<{
    opportunity_id: string;
    status: ApplicationStatus;
    note: string | null;
    created_at: Date;
  }>(
    `SELECT opportunity_id, status, note, created_at FROM applications
     WHERE student_user_id = $1 ORDER BY created_at DESC`,
    [studentUserId],
  );
  return rows.map((r) => ({
    opportunityId: r.opportunity_id,
    status: r.status,
    note: r.note,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

/* ── The employer-facing side ────────────────────────────────────────────────
   §33. First name, age, the city they searched from, roughly how far, when
   they are free, what they are into and what they have done. No surname, no
   contact, no date of birth, no coordinates. This SELECT list is the privacy
   rule; do not widen it without changing the rule. */

export interface InterestedStudentRow {
  applicationId: string;
  firstName: string;
  age: number;
  city: string;
  distanceMiles: number;
  availability: Timing[];
  interests: Interest[];
  thingsDone: string[];
  experience: 'First job' | 'Some experience';
  note: string | null;
  status: ApplicationStatus;
  createdAt: string;
}

export async function loadInterestedStudents(
  opportunityId: string,
): Promise<InterestedStudentRow[]> {
  const rows = await query<{
    id: string;
    first_name: string;
    age: number;
    search_city: string;
    distance_miles: number;
    availability: string[];
    interests: string[];
    things_done: string[];
    has_similar_experience: boolean | null;
    note: string | null;
    status: ApplicationStatus;
    created_at: Date;
  }>(
    `SELECT a.id, s.first_name, s.age, s.search_city,
            ST_Distance(s.search_location, org.location) / 1609.344 AS distance_miles,
            s.availability, s.interests, s.things_done, s.has_similar_experience,
            a.note, a.status, a.created_at
     FROM applications a
     JOIN students s ON s.user_id = a.student_user_id
     JOIN opportunities o ON o.id = a.opportunity_id
     JOIN organizations org ON org.id = o.organization_id
     WHERE a.opportunity_id = $1 AND a.status <> 'WITHDRAWN'
     ORDER BY a.created_at DESC`,
    [opportunityId],
  );

  return rows.map((r) => ({
    applicationId: r.id,
    firstName: r.first_name,
    age: r.age,
    city: r.search_city,
    /* Rounded before it leaves the server. A distance to three decimals plus a
       known workplace is close to a home address. */
    distanceMiles: Math.round(Number(r.distance_miles) * 10) / 10,
    availability: r.availability as Timing[],
    interests: r.interests as Interest[],
    thingsDone: r.things_done,
    experience: r.has_similar_experience ? 'Some experience' : 'First job',
    note: r.note,
    status: r.status,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

export async function countInterested(opportunityIds: string[]): Promise<Record<string, number>> {
  if (opportunityIds.length === 0) return {};
  const rows = await query<{ opportunity_id: string; count: string }>(
    `SELECT opportunity_id, count(*)::text AS count FROM applications
     WHERE opportunity_id = ANY($1::text[]) AND status <> 'WITHDRAWN'
     GROUP BY opportunity_id`,
    [opportunityIds],
  );
  return Object.fromEntries(rows.map((r) => [r.opportunity_id, Number(r.count)]));
}

export async function markViewed(opportunityId: string): Promise<void> {
  await query(
    `UPDATE applications SET status = 'VIEWED', updated_at = now()
     WHERE opportunity_id = $1 AND status = 'INTERESTED'`,
    [opportunityId],
  );
}

export async function respondToApplicant(
  applicationId: string,
  organizationId: string,
  decision: 'EMPLOYER_INTERESTED' | 'NOT_SELECTED',
): Promise<boolean> {
  /* The organization id is part of the WHERE clause, not checked beforehand —
     an employer cannot respond to an application on someone else's posting
     even if they guess the id. */
  const rows = await query<{ id: string }>(
    `UPDATE applications a SET status = $3, updated_at = now()
     FROM opportunities o
     WHERE a.id = $1 AND o.id = a.opportunity_id AND o.organization_id = $2
     RETURNING a.id`,
    [applicationId, organizationId, decision],
  );
  return rows.length > 0;
}
