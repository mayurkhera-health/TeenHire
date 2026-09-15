import { query } from '../db';
import { record } from './events';
import { currentUser } from './session';
import { isAdminContact } from './auth';
import type { SessionUser } from './auth';
import type { VerificationStatus } from '../types';

export { isAdminContact };

/* The operator.
 *
 * Nobody signs up to be an admin. The role is granted from ADMIN_CONTACTS at
 * sign-in and nowhere else — a self-service path to admin would be a hole in
 * the one part of this product that exists to keep minors safe. */

export async function requireAdmin(): Promise<SessionUser | null> {
  const user = await currentUser();
  return user?.role === 'admin' ? user : null;
}

/* Every decision is written down before it takes effect for anyone else.
   §50 asks for auditable admin actions; this is the whole of that promise. */
async function audit(
  actor: SessionUser,
  action: string,
  subjectType: 'organization' | 'opportunity' | 'student',
  subjectId: string,
  detail: Record<string, unknown> = {},
): Promise<void> {
  await query(
    `INSERT INTO audit_log (actor_id, actor_label, action, subject_type, subject_id, detail)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [actor.id, actor.contact, action, subjectType, subjectId, JSON.stringify(detail)],
  );
}

/* ── Verification ─────────────────────────────────────────────────────────── */

export interface PendingOrganization {
  id: string;
  name: string;
  kind: string;
  verificationStatus: VerificationStatus;
  website: string | null;
  phone: string | null;
  city: string;
  zip: string;
  contactEmail: string | null;
  openPostings: number;
  createdAt: string;
  internalNotes: string | null;
}

export async function listOrganizations(status?: VerificationStatus): Promise<PendingOrganization[]> {
  const rows = await query<{
    id: string; name: string; kind: string; verification_status: VerificationStatus;
    website: string | null; phone: string | null; city: string; zip: string;
    contact_email: string | null; open_postings: string; created_at: Date;
    internal_notes: string | null;
  }>(
    `SELECT o.id, o.name, o.kind, o.verification_status, o.website, o.phone, o.city, o.zip,
            o.internal_notes, o.created_at,
            (SELECT u.contact FROM org_members m JOIN users u ON u.id = m.user_id
             WHERE m.organization_id = o.id ORDER BY m.created_at LIMIT 1) AS contact_email,
            (SELECT count(*) FROM opportunities p WHERE p.organization_id = o.id
             AND p.status IN ('PENDING_REVIEW','PUBLISHED'))::text AS open_postings
     FROM organizations o
     ${status ? 'WHERE o.verification_status = $1' : ''}
     ORDER BY
       CASE o.verification_status WHEN 'PENDING' THEN 0 WHEN 'UNVERIFIED' THEN 1 ELSE 2 END,
       o.created_at DESC`,
    status ? [status] : [],
  );

  return rows.map((r) => ({
    id: r.id, name: r.name, kind: r.kind, verificationStatus: r.verification_status,
    website: r.website, phone: r.phone, city: r.city, zip: r.zip,
    contactEmail: r.contact_email, openPostings: Number(r.open_postings),
    createdAt: new Date(r.created_at).toISOString(), internalNotes: r.internal_notes,
  }));
}

export async function setVerification(
  actor: SessionUser,
  organizationId: string,
  status: VerificationStatus,
  note: string | null,
): Promise<{ published: number }> {
  await query(
    `UPDATE organizations
     SET verification_status = $2, verification_note = $3,
         verified_at = CASE WHEN $2 = 'VERIFIED' THEN now() ELSE NULL END,
         verified_by = CASE WHEN $2 = 'VERIFIED' THEN $4 ELSE NULL END,
         updated_at = now()
     WHERE id = $1`,
    [organizationId, status, note, actor.id],
  );
  await audit(actor, `organization.${status.toLowerCase()}`, 'organization', organizationId, { note });

  /* Approving an organization releases what it was already holding. Without
     this an admin would verify a business and its postings would sit in review
     forever, which is how the pipeline got stuck in the first place. */
  let published = 0;
  if (status === 'VERIFIED') {
    const rows = await query<{ id: string }>(
      `UPDATE opportunities SET status = 'PUBLISHED', updated_at = now()
       WHERE organization_id = $1 AND status = 'PENDING_REVIEW' RETURNING id`,
      [organizationId],
    );
    published = rows.length;
    for (const row of rows) {
      await record('OPPORTUNITY_PUBLISHED', { organizationId, opportunityId: row.id });
    }
    await record('ORGANIZATION_VERIFIED', { userId: actor.id, organizationId });
  }

  /* Suspension is the opposite and has to be just as complete: a suspended
     organization cannot leave live postings in front of students. */
  if (status === 'SUSPENDED' || status === 'REJECTED') {
    await query(
      `UPDATE opportunities SET status = 'PAUSED', updated_at = now()
       WHERE organization_id = $1 AND status = 'PUBLISHED'`,
      [organizationId],
    );
  }

  return { published };
}

export async function setOpportunityStatus(
  actor: SessionUser,
  opportunityId: string,
  status: 'PUBLISHED' | 'PAUSED' | 'FILLED' | 'EXPIRED' | 'REJECTED',
): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `UPDATE opportunities SET status = $2, updated_at = now() WHERE id = $1 RETURNING id`,
    [opportunityId, status],
  );
  if (rows.length === 0) return false;
  await audit(actor, `opportunity.${status.toLowerCase()}`, 'opportunity', opportunityId);
  return true;
}

export async function setInternalNotes(
  actor: SessionUser,
  organizationId: string,
  notes: string,
): Promise<void> {
  await query('UPDATE organizations SET internal_notes = $2 WHERE id = $1', [organizationId, notes]);
  await audit(actor, 'organization.note', 'organization', organizationId);
}

/* ── Marketplace health (§38, §39) ────────────────────────────────────────── */

export interface Marketplace {
  supply: { published: number; paid: number; internship: number; volunteer: number;
            pendingReview: number; verifiedOrgs: number; pendingOrgs: number };
  demand: { students: number; byAge: { age: number; count: number }[];
            byType: { type: string; count: number }[] };
  activity: { saves: number; interests: number; employerResponses: number;
              interestRate: number | null; responseRate: number | null;
              medianHoursToFirstInterest: number | null };
}

export async function marketplace(): Promise<Marketplace> {
  const [supply] = await query<Record<string, string>>(
    `SELECT
       count(*) FILTER (WHERE o.status = 'PUBLISHED')::text AS published,
       count(*) FILTER (WHERE o.status = 'PUBLISHED' AND o.type = 'paid')::text AS paid,
       count(*) FILTER (WHERE o.status = 'PUBLISHED' AND o.type = 'internship')::text AS internship,
       count(*) FILTER (WHERE o.status = 'PUBLISHED' AND o.type = 'volunteer')::text AS volunteer,
       count(*) FILTER (WHERE o.status = 'PENDING_REVIEW')::text AS pending_review
     FROM opportunities o`,
  );
  const [orgs] = await query<Record<string, string>>(
    `SELECT count(*) FILTER (WHERE verification_status = 'VERIFIED')::text AS verified,
            count(*) FILTER (WHERE verification_status IN ('PENDING','UNVERIFIED'))::text AS pending
     FROM organizations`,
  );
  const [students] = await query<{ total: string }>('SELECT count(*)::text AS total FROM students');
  const byAge = await query<{ age: number; count: string }>(
    'SELECT age, count(*)::text AS count FROM students GROUP BY age ORDER BY age',
  );
  const byType = await query<{ type: string; count: string }>(
    `SELECT unnest(types) AS type, count(*)::text AS count FROM students GROUP BY 1 ORDER BY 2 DESC`,
  );
  const [activity] = await query<Record<string, string>>(
    `SELECT
       (SELECT count(*) FROM events WHERE name = 'OPPORTUNITY_SAVE')::text AS saves,
       (SELECT count(*) FROM applications WHERE status <> 'WITHDRAWN')::text AS interests,
       (SELECT count(*) FROM applications
        WHERE status IN ('EMPLOYER_INTERESTED','NOT_SELECTED','HIRED'))::text AS responses,
       (SELECT count(*) FROM events WHERE name = 'OPPORTUNITY_VIEW')::text AS views`,
  );

  /* §49's time to first interest. The median rather than the mean: one
     posting that sat for a month should not be able to describe the rest. */
  const [ttfi] = await query<{ hours: string | null }>(
    `SELECT percentile_cont(0.5) WITHIN GROUP (
              ORDER BY EXTRACT(EPOCH FROM (first_interest - published_at)) / 3600
            )::text AS hours
     FROM (
       SELECT o.published_at, min(a.created_at) AS first_interest
       FROM opportunities o JOIN applications a ON a.opportunity_id = o.id
       GROUP BY o.id, o.published_at
     ) t`,
  );

  const views = Number(activity?.views ?? 0);
  const interests = Number(activity?.interests ?? 0);
  const responses = Number(activity?.responses ?? 0);

  return {
    supply: {
      published: Number(supply?.published ?? 0),
      paid: Number(supply?.paid ?? 0),
      internship: Number(supply?.internship ?? 0),
      volunteer: Number(supply?.volunteer ?? 0),
      pendingReview: Number(supply?.pending_review ?? 0),
      verifiedOrgs: Number(orgs?.verified ?? 0),
      pendingOrgs: Number(orgs?.pending ?? 0),
    },
    demand: {
      students: Number(students?.total ?? 0),
      byAge: byAge.map((r) => ({ age: r.age, count: Number(r.count) })),
      byType: byType.map((r) => ({ type: r.type, count: Number(r.count) })),
    },
    activity: {
      saves: Number(activity?.saves ?? 0),
      interests,
      employerResponses: responses,
      interestRate: views > 0 ? Math.round((interests / views) * 1000) / 10 : null,
      responseRate: interests > 0 ? Math.round((responses / interests) * 1000) / 10 : null,
      medianHoursToFirstInterest: ttfi?.hours ? Math.round(Number(ttfi.hours) * 10) / 10 : null,
    },
  };
}

/* ── Demand signals (§40) ─────────────────────────────────────────────────── */

export interface DemandCell {
  city: string;
  ageBand: string;
  type: string;
  availability: string;
  students: number;
}

/* §41: always aggregated, never individuals. The floor below is the part the
   spec does not spell out and needs — in a thin market a cell of one is a
   named student wearing a count, and "Saratoga · 17 · volunteer · 1 student"
   identifies somebody. Cells under the floor are withheld entirely. */
export const DEMAND_MIN_CELL = 5;

export async function demandSignals(): Promise<{ cells: DemandCell[]; withheld: number }> {
  const rows = await query<{
    city: string; age_band: string; type: string; availability: string; students: string;
  }>(
    `SELECT s.search_city AS city,
            CASE WHEN s.age <= 16 THEN '15–16' ELSE '17–18' END AS age_band,
            t.type,
            a.availability,
            count(DISTINCT s.user_id)::text AS students
     FROM students s
     CROSS JOIN LATERAL unnest(s.types) AS t(type)
     CROSS JOIN LATERAL unnest(s.availability) AS a(availability)
     GROUP BY 1,2,3,4
     ORDER BY count(DISTINCT s.user_id) DESC`,
  );

  const all = rows.map((r) => ({
    city: r.city, ageBand: r.age_band, type: r.type,
    availability: r.availability, students: Number(r.students),
  }));

  const cells = all.filter((c) => c.students >= DEMAND_MIN_CELL);
  return { cells, withheld: all.length - cells.length };
}

export async function recentAudit(limit = 25) {
  return query<{
    actor_label: string; action: string; subject_type: string; subject_id: string; created_at: Date;
  }>(
    `SELECT actor_label, action, subject_type, subject_id, created_at
     FROM audit_log ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
}
