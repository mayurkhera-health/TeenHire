import { randomBytes } from 'node:crypto';
import { query } from '../db';
import { DEFAULT_LOCATION, lookupZip } from '../geo';
import { statusFor } from '../opportunityDraft';
import type { Opportunity, OrganizationKind, VerificationStatus } from '../types';

/* Organizations, their members, and their postings.
 *
 * An organization record and an organization login are separate things here
 * (§35): membership lives in its own table, so an admin can create a record
 * for a business that has never signed in, and that business can be attached
 * to an account later without the row changing shape. */

const id = (prefix: string) => `${prefix}_${randomBytes(9).toString('base64url')}`;

export interface NewOrganization {
  name: string;
  kind: OrganizationKind;
  website?: string;
  phone?: string;
  contactName: string;
  city: string;
  zip: string;
  about?: string;
}

export async function createOrganization(
  input: NewOrganization,
  ownerUserId: string | null,
): Promise<string> {
  /* Geocoded from the ZIP for now. Real address geocoding is a Phase 2
     concern; what matters today is that the point is real enough for the
     distance query to mean something. */
  const place = lookupZip(input.zip) ?? { ...DEFAULT_LOCATION, zip: input.zip, city: input.city };
  const organizationId = id('org');

  await query(
    `INSERT INTO organizations
       (id, name, kind, verification_status, website, phone, about, city, zip, location)
     VALUES ($1,$2,$3,'PENDING',$4,$5,$6,$7,$8,
             ST_SetSRID(ST_MakePoint($9,$10),4326)::geography)`,
    [
      organizationId,
      input.name,
      input.kind,
      input.website || null,
      input.phone || null,
      input.about ?? '',
      input.city,
      input.zip,
      place.lng,
      place.lat,
    ],
  );

  /* No owner for an admin-created record. That is the point of §35. */
  if (ownerUserId) {
    await query(
      `INSERT INTO org_members (user_id, organization_id, role) VALUES ($1,$2,'owner')
       ON CONFLICT DO NOTHING`,
      [ownerUserId, organizationId],
    );
    await query(`UPDATE users SET role = 'org' WHERE id = $1 AND role = 'student'`, [ownerUserId]);
  }

  return organizationId;
}

export interface OrgSummary {
  id: string;
  name: string;
  kind: OrganizationKind;
  verificationStatus: VerificationStatus;
  city: string;
  zip: string;
}

export async function organizationForUser(userId: string): Promise<OrgSummary | null> {
  const [row] = await query<{
    id: string;
    name: string;
    kind: OrganizationKind;
    verification_status: VerificationStatus;
    city: string;
    zip: string;
  }>(
    `SELECT o.id, o.name, o.kind, o.verification_status, o.city, o.zip
     FROM org_members m JOIN organizations o ON o.id = m.organization_id
     WHERE m.user_id = $1 ORDER BY m.created_at LIMIT 1`,
    [userId],
  );
  return row
    ? {
        id: row.id,
        name: row.name,
        kind: row.kind,
        verificationStatus: row.verification_status,
        city: row.city,
        zip: row.zip,
      }
    : null;
}

export type CreationMethod = 'EMPLOYER_SELF_SERVICE' | 'ADMIN_ASSISTED';

/* One writer for every creation route (§28/§36). An admin-assisted posting and
   a self-service one differ by a column, not by a code path. */
export async function createOpportunity(
  opportunity: Omit<Opportunity, 'id' | 'status'>,
  options: {
    organizationId: string;
    createdByUserId: string | null;
    creationMethod: CreationMethod;
    internalNotes?: string | null;
  },
): Promise<{ id: string; status: string }> {
  const [org] = await query<{ verification_status: VerificationStatus }>(
    'SELECT verification_status FROM organizations WHERE id = $1',
    [options.organizationId],
  );
  if (!org) throw new Error('Unknown organization');

  /* A posting is never more trusted than the organization behind it. */
  const status = statusFor(org.verification_status);
  const opportunityId = id('opp');

  await query(
    `INSERT INTO opportunities
       (id, organization_id, title, type, status, minimum_age, experience, hours,
        compensation, summary, reassurance, responsibilities, schedule, good_to_know,
        interests, published_at, created_by_user_id, creation_method, internal_notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
    [
      opportunityId,
      options.organizationId,
      opportunity.title,
      opportunity.type,
      status,
      opportunity.minimumAge,
      opportunity.experience,
      opportunity.hours ?? null,
      JSON.stringify(opportunity.compensation),
      opportunity.summary,
      opportunity.reassurance,
      opportunity.responsibilities,
      opportunity.schedule,
      opportunity.goodToKnow,
      opportunity.interests,
      opportunity.publishedAt,
      options.createdByUserId,
      options.creationMethod,
      options.internalNotes ?? null,
    ],
  );

  for (const timing of opportunity.timing) {
    await query(
      'INSERT INTO opportunity_timing (opportunity_id, timing) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [opportunityId, timing],
    );
  }

  return { id: opportunityId, status };
}

export interface OrgPosting {
  id: string;
  title: string;
  type: string;
  status: string;
  minimumAge: number;
  timing: string[];
  compensation: unknown;
  interested: number;
  publishedAt: string;
}

export async function listPostings(organizationId: string): Promise<OrgPosting[]> {
  const rows = await query<{
    id: string;
    title: string;
    type: string;
    status: string;
    minimum_age: number;
    timing: string[];
    compensation: unknown;
    interested: string;
    published_at: Date;
  }>(
    `SELECT o.id, o.title, o.type, o.status, o.minimum_age, o.compensation, o.published_at,
            COALESCE(array_agg(DISTINCT t.timing) FILTER (WHERE t.timing IS NOT NULL), '{}') AS timing,
            (SELECT count(*) FROM applications a
             WHERE a.opportunity_id = o.id AND a.status <> 'WITHDRAWN')::text AS interested
     FROM opportunities o
     LEFT JOIN opportunity_timing t ON t.opportunity_id = o.id
     WHERE o.organization_id = $1
     GROUP BY o.id
     ORDER BY o.published_at DESC`,
    [organizationId],
  );

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    type: r.type,
    status: r.status,
    minimumAge: r.minimum_age,
    timing: r.timing,
    compensation: r.compensation,
    interested: Number(r.interested),
    publishedAt: new Date(r.published_at).toISOString(),
  }));
}

/* Ownership is a WHERE clause, never a check the caller can forget. */
export async function ownsOpportunity(
  organizationId: string,
  opportunityId: string,
): Promise<boolean> {
  const rows = await query<{ id: string }>(
    'SELECT id FROM opportunities WHERE id = $1 AND organization_id = $2',
    [opportunityId, organizationId],
  );
  return rows.length > 0;
}

/* ── Phase 3: an employer's control over their own postings ──────────────────
   Every one of these takes organization_id in the WHERE clause rather than
   checking it first. An employer cannot touch another organization's posting
   even by guessing an id, and there is no ordering of calls that skips the
   check because the check is the query. */

export interface EditablePosting {
  id: string;
  title: string;
  type: string;
  status: string;
  minimumAge: number;
  experience: string;
  timing: string[];
  hours: string | null;
  compensation: unknown;
  summary: string;
  /* Ages of students who have already expressed interest, so the edit screen
     can warn before a raised minimum age quietly disqualifies them. */
  interestedAges: number[];
}

export async function loadPostingForEdit(
  organizationId: string,
  opportunityId: string,
): Promise<EditablePosting | null> {
  const [row] = await query<{
    id: string; title: string; type: string; status: string; minimum_age: number;
    experience: string; timing: string[]; hours: string | null; compensation: unknown;
    summary: string; interested_ages: number[];
  }>(
    `SELECT o.id, o.title, o.type, o.status, o.minimum_age, o.experience, o.hours,
            o.compensation, o.summary,
            COALESCE(array_agg(DISTINCT t.timing) FILTER (WHERE t.timing IS NOT NULL), '{}') AS timing,
            COALESCE((
              SELECT array_agg(s.age) FROM applications a
              JOIN students s ON s.user_id = a.student_user_id
              WHERE a.opportunity_id = o.id AND a.status <> 'WITHDRAWN'
            ), '{}') AS interested_ages
     FROM opportunities o
     LEFT JOIN opportunity_timing t ON t.opportunity_id = o.id
     WHERE o.id = $1 AND o.organization_id = $2
     GROUP BY o.id`,
    [opportunityId, organizationId],
  );

  return row
    ? {
        id: row.id, title: row.title, type: row.type, status: row.status,
        minimumAge: row.minimum_age, experience: row.experience, timing: row.timing,
        hours: row.hours, compensation: row.compensation, summary: row.summary,
        interestedAges: row.interested_ages ?? [],
      }
    : null;
}

export interface PostingEdit {
  title: string;
  summary: string;
  minimumAge: number;
  experience: string;
  timing: string[];
  hours: string | null;
  compensation: unknown;
}

export async function updatePosting(
  organizationId: string,
  opportunityId: string,
  edit: PostingEdit,
): Promise<boolean> {
  /* Provenance is not editable. Who created a posting and how it arrived are
     facts about the past, and the pilot depends on being able to tell
     self-service supply from supply we went and fetched. */
  const rows = await query<{ id: string }>(
    `UPDATE opportunities
     SET title = $3, summary = $4, reassurance = COALESCE(NULLIF($4,''), reassurance),
         minimum_age = $5, experience = $6, hours = $7, compensation = $8, updated_at = now()
     WHERE id = $1 AND organization_id = $2
     RETURNING id`,
    [opportunityId, organizationId, edit.title, edit.summary, edit.minimumAge,
     edit.experience, edit.hours, JSON.stringify(edit.compensation)],
  );
  if (rows.length === 0) return false;

  await query('DELETE FROM opportunity_timing WHERE opportunity_id = $1', [opportunityId]);
  for (const timing of edit.timing) {
    await query(
      'INSERT INTO opportunity_timing (opportunity_id, timing) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [opportunityId, timing],
    );
  }
  return true;
}

export type EmployerStatus = 'PUBLISHED' | 'PAUSED' | 'FILLED';

export async function setEmployerStatus(
  organizationId: string,
  opportunityId: string,
  status: EmployerStatus,
): Promise<{ ok: boolean; error?: string }> {
  const [org] = await query<{ verification_status: VerificationStatus }>(
    'SELECT verification_status FROM organizations WHERE id = $1',
    [organizationId],
  );
  if (!org) return { ok: false, error: 'Unknown organization' };

  /* An employer can pause and fill their own postings freely. Going live is
     different: publishing is the one transition that puts something in front
     of a student, and an unverified or suspended organization must not be
     able to reach it by pausing and resuming. */
  if (status === 'PUBLISHED' && org.verification_status !== 'VERIFIED') {
    return { ok: false, error: 'Your organization is still being checked' };
  }

  const rows = await query<{ id: string }>(
    `UPDATE opportunities SET status = $3, updated_at = now()
     WHERE id = $1 AND organization_id = $2
       AND status IN ('PUBLISHED','PAUSED','FILLED')
     RETURNING id`,
    [opportunityId, organizationId, status],
  );
  return rows.length > 0
    ? { ok: true }
    : { ok: false, error: 'That posting cannot change state right now' };
}
