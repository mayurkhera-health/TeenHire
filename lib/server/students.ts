import { query } from '../db';
import type { Interest, OpportunityType, StudentProfile, Timing, Transportation } from '../types';

/* The student record.
 *
 * search_location lives here and goes nowhere else. Nothing an organization
 * can read joins this table — §13's rule is enforced by the shape of the
 * queries, not by remembering to omit a column. */

interface StudentRow {
  first_name: string;
  age: number;
  lat: number;
  lng: number;
  search_city: string;
  search_zip: string;
  radius_miles: number;
  types: string[];
  availability: string[];
  interests: string[];
  transportation: string[];
  skills: string[];
  things_done: string[];
  has_similar_experience: boolean | null;
}

export async function loadStudent(userId: string): Promise<StudentProfile | null> {
  const [row] = await query<StudentRow>(
    `SELECT first_name, age,
            ST_Y(search_location::geometry) AS lat,
            ST_X(search_location::geometry) AS lng,
            search_city, search_zip, radius_miles, types, availability, interests,
            transportation, skills, things_done, has_similar_experience
     FROM students WHERE user_id = $1`,
    [userId],
  );
  if (!row) return null;

  return {
    name: row.first_name,
    age: row.age,
    searchLocation: {
      city: row.search_city,
      zip: row.search_zip,
      lat: Number(row.lat),
      lng: Number(row.lng),
    },
    radiusMiles: row.radius_miles,
    types: row.types as OpportunityType[],
    availability: row.availability as Timing[],
    interests: row.interests as Interest[],
    transportation: row.transportation as Transportation[],
    skills: row.skills,
    thingsDone: row.things_done,
    ...(row.has_similar_experience === null
      ? {}
      : { hasSimilarExperience: row.has_similar_experience }),
  };
}

export async function saveStudent(userId: string, profile: StudentProfile): Promise<void> {
  await query(
    `INSERT INTO students (
       user_id, first_name, age, search_location, search_city, search_zip, radius_miles,
       types, availability, interests, transportation, skills, things_done,
       has_similar_experience, updated_at)
     VALUES ($1,$2,$3, ST_SetSRID(ST_MakePoint($4,$5),4326)::geography, $6,$7,$8,
             $9,$10,$11,$12,$13,$14,$15, now())
     ON CONFLICT (user_id) DO UPDATE SET
       first_name = EXCLUDED.first_name,
       age = EXCLUDED.age,
       search_location = EXCLUDED.search_location,
       search_city = EXCLUDED.search_city,
       search_zip = EXCLUDED.search_zip,
       radius_miles = EXCLUDED.radius_miles,
       types = EXCLUDED.types,
       availability = EXCLUDED.availability,
       interests = EXCLUDED.interests,
       transportation = EXCLUDED.transportation,
       skills = EXCLUDED.skills,
       things_done = EXCLUDED.things_done,
       has_similar_experience = EXCLUDED.has_similar_experience,
       updated_at = now()`,
    [
      userId,
      profile.name,
      profile.age,
      profile.searchLocation.lng,
      profile.searchLocation.lat,
      profile.searchLocation.city,
      profile.searchLocation.zip,
      profile.radiusMiles,
      profile.types,
      profile.availability,
      profile.interests,
      profile.transportation,
      profile.skills,
      profile.thingsDone,
      profile.hasSimilarExperience ?? null,
    ],
  );
}

export async function loadSaved(userId: string): Promise<string[]> {
  const rows = await query<{ opportunity_id: string }>(
    `SELECT opportunity_id FROM saved_opportunities
     WHERE student_user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  return rows.map((r) => r.opportunity_id);
}

export async function toggleSaved(userId: string, opportunityId: string): Promise<boolean> {
  const removed = await query<{ opportunity_id: string }>(
    `DELETE FROM saved_opportunities
     WHERE student_user_id = $1 AND opportunity_id = $2 RETURNING opportunity_id`,
    [userId, opportunityId],
  );
  if (removed.length > 0) return false;

  await query(
    `INSERT INTO saved_opportunities (student_user_id, opportunity_id) VALUES ($1,$2)
     ON CONFLICT DO NOTHING`,
    [userId, opportunityId],
  );
  return true;
}
