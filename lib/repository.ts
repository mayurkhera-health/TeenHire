import { query } from './db';
import type {
  Compensation,
  Experience,
  HoursBucket,
  Interest,
  MinimumAge,
  Opportunity,
  OpportunityStatus,
  OpportunityType,
  Organization,
  OrganizationKind,
  Timing,
  VerificationStatus,
} from './types';

/* The read path.
 *
 * This is §47's query, and it is the boundary the whole product rests on:
 * published, from a verified organization, old enough, within range. A row
 * that fails any of those never reaches the application layer at all, so no
 * screen and no notification can accidentally surface it.
 *
 * Ranking deliberately stays in TypeScript. Distance and age are set
 * operations a database does better; the ordering rules are product decisions
 * that are pinned by tests, and moving them into SQL would trade that
 * coverage for nothing. */

const METRES_PER_MILE = 1609.344;

export interface FeedRow {
  opportunity: Opportunity;
  organization: Organization;
  /* Computed by PostGIS on the sphere, not by the app. */
  distanceMiles: number;
}

interface RawRow {
  id: string;
  organization_id: string;
  title: string;
  type: OpportunityType;
  status: OpportunityStatus;
  minimum_age: number;
  experience: Experience;
  hours: HoursBucket | null;
  compensation: Compensation;
  summary: string;
  reassurance: string;
  responsibilities: string[];
  schedule: string;
  good_to_know: string[];
  interests: string[];
  published_at: Date;
  timing: string[];
  org_name: string;
  org_kind: OrganizationKind;
  org_verification: VerificationStatus;
  org_website: string | null;
  org_phone: string | null;
  org_about: string;
  org_city: string;
  org_zip: string;
  org_lat: number;
  org_lng: number;
  distance_miles: number;
}

const SELECT_FEED = `
  SELECT
    o.id, o.organization_id, o.title, o.type, o.status, o.minimum_age,
    o.experience, o.hours, o.compensation, o.summary, o.reassurance,
    o.responsibilities, o.schedule, o.good_to_know, o.interests, o.published_at,
    COALESCE(
      array_agg(t.timing ORDER BY t.timing) FILTER (WHERE t.timing IS NOT NULL),
      '{}'
    ) AS timing,
    org.name              AS org_name,
    org.kind              AS org_kind,
    org.verification_status AS org_verification,
    org.website           AS org_website,
    org.phone             AS org_phone,
    org.about             AS org_about,
    org.city              AS org_city,
    org.zip               AS org_zip,
    ST_Y(org.location::geometry) AS org_lat,
    ST_X(org.location::geometry) AS org_lng,
    ST_Distance(org.location, $1::geography) / ${METRES_PER_MILE} AS distance_miles
  FROM opportunities o
  JOIN organizations org ON org.id = o.organization_id
  LEFT JOIN opportunity_timing t ON t.opportunity_id = o.id
`;

const GROUP_BY = ` GROUP BY o.id, org.id`;

function toRow(r: RawRow): FeedRow {
  return {
    opportunity: {
      id: r.id,
      organizationId: r.organization_id,
      title: r.title,
      type: r.type,
      status: r.status,
      minimumAge: r.minimum_age as MinimumAge,
      experience: r.experience,
      timing: r.timing as Timing[],
      hours: r.hours ?? undefined,
      compensation: r.compensation,
      summary: r.summary,
      reassurance: r.reassurance,
      responsibilities: r.responsibilities,
      schedule: r.schedule,
      goodToKnow: r.good_to_know,
      interests: r.interests as Interest[],
      publishedAt: new Date(r.published_at).toISOString(),
    },
    organization: {
      id: r.organization_id,
      name: r.org_name,
      kind: r.org_kind,
      verificationStatus: r.org_verification,
      website: r.org_website ?? undefined,
      phone: r.org_phone ?? undefined,
      about: r.org_about,
      location: { city: r.org_city, zip: r.org_zip, lat: r.org_lat, lng: r.org_lng },
    },
    distanceMiles: Number(r.distance_miles),
  };
}

export interface EligibilityQuery {
  age: number;
  lat: number;
  lng: number;
  radiusMiles: number;
}

/* §47, verbatim:
     find published opportunities
     where minimum_age <= student_age
     and distance <= student_radius
   plus the verification gate, which is the one filter that exists for safety
   rather than for relevance. */
export async function findEligible({
  age,
  lat,
  lng,
  radiusMiles,
}: EligibilityQuery): Promise<FeedRow[]> {
  const rows = await query<RawRow>(
    `${SELECT_FEED}
     WHERE o.status = 'PUBLISHED'
       AND org.verification_status = 'VERIFIED'
       AND o.minimum_age <= $2
       AND ST_DWithin(org.location, $1::geography, $3)
     ${GROUP_BY}
     ORDER BY distance_miles ASC`,
    [point(lng, lat), age, radiusMiles * METRES_PER_MILE],
  );
  return rows.map(toRow);
}

/* Everything eligible between the student's radius and a wider one — what the
   empty state and the thin-market line count. Same gates, a ring instead of a
   disc, so the two numbers can never disagree. */
export async function countBeyond(
  { age, lat, lng, radiusMiles }: EligibilityQuery,
  outerMiles: number,
): Promise<number> {
  const rows = await query<{ count: string }>(
    `SELECT count(DISTINCT o.id)::text AS count
     FROM opportunities o
     JOIN organizations org ON org.id = o.organization_id
     WHERE o.status = 'PUBLISHED'
       AND org.verification_status = 'VERIFIED'
       AND o.minimum_age <= $2
       AND ST_DWithin(org.location, $1::geography, $4)
       AND NOT ST_DWithin(org.location, $1::geography, $3)`,
    [point(lng, lat), age, radiusMiles * METRES_PER_MILE, outerMiles * METRES_PER_MILE],
  );
  return Number(rows[0]?.count ?? 0);
}

/* Named opportunities, whatever their state. Saved, Activity and a shared
   detail link all have to show something a student may no longer qualify for,
   so this one deliberately applies none of the feed's gates. */
export async function findManyByIds(
  ids: string[],
  from: { lat: number; lng: number },
): Promise<FeedRow[]> {
  if (ids.length === 0) return [];
  const rows = await query<RawRow>(
    `${SELECT_FEED} WHERE o.id = ANY($2::text[]) ${GROUP_BY}`,
    [point(from.lng, from.lat), ids],
  );
  /* Returned in the order asked for — Saved is newest-first and the database
     has no opinion about that. */
  const byId = new Map(rows.map((r) => [r.id, toRow(r)]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}

export async function findById(
  id: string,
  from: { lat: number; lng: number },
): Promise<FeedRow | null> {
  const [row] = await findManyByIds([id], from);
  return row ?? null;
}

function point(lng: number, lat: number): string {
  /* WKT keeps the parameter a plain string, so the driver never has to know
     about PostGIS types. */
  return `SRID=4326;POINT(${lng} ${lat})`;
}
