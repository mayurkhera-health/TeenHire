import { OPPORTUNITIES, ORGANIZATIONS } from '../lib/data';
import { getPool } from '../lib/db';

/* Loads the fixture into Postgres. The same data the app has always used, so
   moving the read path to the database changes where the rows come from and
   nothing about what they say. */

async function main() {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    /* Truncate rather than upsert: this is a fixture loader, and a partially
       refreshed fixture is harder to reason about than an empty one. */
    await client.query('TRUNCATE opportunity_timing, opportunities, organizations CASCADE');

    for (const org of ORGANIZATIONS) {
      await client.query(
        `INSERT INTO organizations
           (id, name, kind, verification_status, website, phone, about, city, zip, location)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, ST_SetSRID(ST_MakePoint($10,$11),4326)::geography)`,
        [org.id, org.name, org.kind, org.verificationStatus, org.website ?? null,
         org.phone ?? null, org.about, org.location.city, org.location.zip,
         org.location.lng, org.location.lat],
      );
    }

    for (const o of OPPORTUNITIES) {
      await client.query(
        `INSERT INTO opportunities
           (id, organization_id, title, type, status, minimum_age, experience, hours,
            compensation, summary, reassurance, responsibilities, schedule,
            good_to_know, interests, published_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [o.id, o.organizationId, o.title, o.type, o.status, o.minimumAge, o.experience,
         o.hours ?? null, JSON.stringify(o.compensation), o.summary, o.reassurance,
         o.responsibilities, o.schedule, o.goodToKnow, o.interests, o.publishedAt],
      );
      for (const timing of o.timing) {
        await client.query(
          'INSERT INTO opportunity_timing (opportunity_id, timing) VALUES ($1,$2)',
          [o.id, timing],
        );
      }
    }

    await client.query('COMMIT');
    const counts = await client.query(
      `SELECT (SELECT count(*) FROM organizations) AS orgs,
              (SELECT count(*) FROM opportunities) AS opps,
              (SELECT count(*) FROM opportunity_timing) AS timings,
              (SELECT count(*) FROM opportunities WHERE status = 'PUBLISHED') AS published`,
    );
    console.log('seeded', counts.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
