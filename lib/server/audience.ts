import { query } from '../db';
import { isVerified } from '../types';
import { evaluateFit } from '../matching';
import { newMatch, channelFor, type Notification } from '../notifications';
import type {
  Compensation,
  Experience,
  HoursBucket,
  Interest,
  MinimumAge,
  NotificationPreferences,
  OpportunityType,
  OrganizationKind,
  StudentProfile,
  Timing,
} from '../types';

/* Who hears about a new posting, and what each of them is told.
 *
 * §19 says publishing raises a matching event. The dangerous shape of that
 * feature is an audience list: the moment "which students match this posting"
 * becomes a value an employer can request, the privacy envelope is gone. So
 * this module returns notifications, never people, and nothing above it ever
 * sees a student id it did not already have.
 *
 * The gates are applied twice on purpose. SQL narrows to published, verified,
 * old enough and in range — §47's query with the student and the opportunity
 * swapped round. Then evaluateFit re-derives the same answer in TypeScript and
 * anything it calls ineligible is dropped. Two independent implementations
 * agreeing is what the parity suite checks for the feed, and it is the same
 * property that matters here: a student must never be told about something the
 * app would then refuse to show them. */

const METRES_PER_MILE = 1609.344;

const DEFAULT_PREFERENCES: NotificationPreferences = {
  types: ['paid', 'internship', 'volunteer'],
  frequency: 'daily',
};

export async function preferencesFor(userId: string): Promise<NotificationPreferences> {
  const [row] = await query<{ notify_types: string[]; notify_frequency: string }>(
    'SELECT notify_types, notify_frequency FROM students WHERE user_id = $1',
    [userId],
  );
  if (!row) return DEFAULT_PREFERENCES;
  return {
    types: row.notify_types as OpportunityType[],
    frequency: row.notify_frequency as NotificationPreferences['frequency'],
  };
}

export async function savePreferences(
  userId: string,
  preferences: NotificationPreferences,
): Promise<boolean> {
  const rows = await query<{ user_id: string }>(
    `UPDATE students SET notify_types = $2, notify_frequency = $3, updated_at = now()
     WHERE user_id = $1 RETURNING user_id`,
    [userId, preferences.types, preferences.frequency],
  );
  return rows.length > 0;
}

export interface Addressed {
  userId: string;
  notification: Notification;
}

/* Every student who should hear about one newly published opportunity.
 *
 * "off" never reaches here — it is excluded in SQL rather than filtered
 * afterwards, so a student who switched notifications off is not even a row
 * this function has to remember to skip. Same for a type they opted out of. */
export async function audienceFor(opportunityId: string): Promise<Addressed[]> {
  const rows = await query<{
    user_id: string;
    age: number;
    first_name: string;
    search_city: string;
    search_zip: string;
    lat: number;
    lng: number;
    radius_miles: number;
    availability: string[];
    has_similar_experience: boolean | null;
    notify_frequency: string;
    /* the posting */
    o_id: string;
    o_title: string;
    o_type: OpportunityType;
    o_minimum_age: number;
    o_experience: Experience;
    o_hours: HoursBucket | null;
    o_compensation: Compensation;
    o_summary: string;
    o_reassurance: string;
    o_interests: string[];
    o_published_at: Date;
    o_timing: string[];
    org_id: string;
    org_name: string;
    org_kind: OrganizationKind;
    org_verification: string;
    org_about: string;
    org_city: string;
    org_zip: string;
    org_lat: number;
    org_lng: number;
  }>(
    `SELECT s.user_id, s.age, s.first_name, s.search_city, s.search_zip,
            ST_Y(s.search_location::geometry) AS lat,
            ST_X(s.search_location::geometry) AS lng,
            s.radius_miles, s.availability, s.has_similar_experience, s.notify_frequency,
            o.id AS o_id, o.title AS o_title, o.type AS o_type, o.minimum_age AS o_minimum_age,
            o.experience AS o_experience, o.hours AS o_hours, o.compensation AS o_compensation,
            o.summary AS o_summary, o.reassurance AS o_reassurance, o.interests AS o_interests,
            o.published_at AS o_published_at,
            COALESCE(array_agg(t.timing ORDER BY t.timing) FILTER (WHERE t.timing IS NOT NULL), '{}') AS o_timing,
            org.id AS org_id, org.name AS org_name, org.kind AS org_kind,
            org.verification_status AS org_verification, org.about AS org_about,
            org.city AS org_city, org.zip AS org_zip,
            ST_Y(org.location::geometry) AS org_lat,
            ST_X(org.location::geometry) AS org_lng
     FROM opportunities o
     JOIN organizations org ON org.id = o.organization_id
     LEFT JOIN opportunity_timing t ON t.opportunity_id = o.id
     JOIN students s
       ON s.age >= o.minimum_age
      AND ST_DWithin(org.location, s.search_location, s.radius_miles * ${METRES_PER_MILE})
     WHERE o.id = $1
       AND o.status = 'PUBLISHED'
       AND org.verification_status = 'VERIFIED'
       AND s.notify_frequency <> 'off'
       AND o.type = ANY(s.notify_types)
     GROUP BY s.user_id, o.id, org.id`,
    [opportunityId],
  );

  const addressed: Addressed[] = [];

  for (const r of rows) {
    const opportunity = {
      id: r.o_id,
      organizationId: r.org_id,
      title: r.o_title,
      type: r.o_type,
      status: 'PUBLISHED' as const,
      minimumAge: r.o_minimum_age as MinimumAge,
      experience: r.o_experience,
      timing: r.o_timing as Timing[],
      hours: r.o_hours ?? undefined,
      compensation: r.o_compensation,
      summary: r.o_summary,
      reassurance: r.o_reassurance,
      responsibilities: [],
      schedule: '',
      goodToKnow: [],
      interests: r.o_interests as Interest[],
      publishedAt: new Date(r.o_published_at).toISOString(),
    };

    const organization = {
      id: r.org_id,
      name: r.org_name,
      kind: r.org_kind,
      verificationStatus: r.org_verification as 'VERIFIED',
      about: r.org_about,
      location: { city: r.org_city, zip: r.org_zip, lat: r.org_lat, lng: r.org_lng },
    };

    const student: StudentProfile = {
      name: r.first_name,
      age: r.age,
      searchLocation: { city: r.search_city, zip: r.search_zip, lat: r.lat, lng: r.lng },
      radiusMiles: r.radius_miles,
      types: [],
      availability: r.availability as Timing[],
      interests: [],
      transportation: [],
      skills: [],
      thingsDone: [],
      hasSimilarExperience: r.has_similar_experience ?? undefined,
    };

    /* The second gate. If TypeScript and SQL ever disagree about who is
       eligible, the message is the thing that does not go out. */
    if (!isVerified(organization)) continue;
    const fit = evaluateFit(opportunity, organization, student);
    if (student.age < opportunity.minimumAge) continue;
    if (fit.distance > student.radiusMiles) continue;

    const channel = channelFor({
      types: [],
      frequency: r.notify_frequency as NotificationPreferences['frequency'],
    });
    if (channel === null) continue;

    addressed.push({
      userId: r.user_id,
      notification: newMatch({ opportunity, organization, fit }, channel),
    });
  }

  return addressed;
}
