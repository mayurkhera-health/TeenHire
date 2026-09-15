import { OPPORTUNITIES, ORGANIZATIONS } from '../lib/data';
import { getPool } from '../lib/db';
import type { PoolClient } from 'pg';

/* Loads the fixture into Postgres. The same data the app has always used, so
   moving the read path to the database changed where the rows come from and
   nothing about what they say.
 *
 * Exported as a function because the parity suite needs to reset to exactly
 * this before it compares SQL against the in-memory rules — a row created by
 * any other test would otherwise look like a disagreement. */

export async function seedFixture(client: PoolClient): Promise<void> {
  /* Only the fixture is replaced. Anything an admin or an employer created is
     left alone — this is a loader, not a reset button for the database. */
  await client.query("DELETE FROM opportunity_timing WHERE opportunity_id IN (SELECT id FROM opportunities WHERE creation_method = 'SEED')");
  await client.query("DELETE FROM opportunities WHERE creation_method = 'SEED'");
  await client.query(
    `DELETE FROM organizations WHERE id = ANY($1::text[])`,
    [ORGANIZATIONS.map((o) => o.id)],
  );

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
          good_to_know, interests, published_at, creation_method)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'SEED')`,
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
}

/* Everything that is not the fixture. Used only by the parity suite, which
   compares the database against the in-memory rules and therefore has to be
   looking at exactly the fixture and nothing else. */
export async function isolateFixture(client: PoolClient): Promise<void> {
  await client.query("DELETE FROM opportunities WHERE creation_method <> 'SEED'");
  await client.query(
    `DELETE FROM organizations WHERE id <> ALL($1::text[])`,
    [ORGANIZATIONS.map((o) => o.id)],
  );
}

async function main() {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await seedFixture(client);
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

/* Only run as a script, not when imported by a test. */
if (process.argv[1]?.endsWith('seed.ts')) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
