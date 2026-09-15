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
