import { OPPORTUNITIES, ORGANIZATIONS } from '../lib/data';
import { matchFeed, countBeyondRadius } from '../lib/matching';
import { findEligible, countBeyond } from '../lib/repository';
import { getPool } from '../lib/db';
import { isolateFixture, seedFixture } from '../db/seed';
import type { StudentProfile } from '../lib/types';

/* Parity between the SQL read path and the in-memory rules the unit tests
   pin. Run with `npm run test:db` against a seeded database; it is kept out of
   `npm test` because it needs one, and a suite that cannot run everywhere
   stops being run at all.
 *
 * This is the check that made the migration safe: if SQL and TypeScript ever
 * disagree, what a student sees changes without anyone deciding it should.
 * Delete it only when the in-memory path is gone. */

const PLACES = {
  'Santa Clara':   { city: 'Santa Clara',   zip: '95050', lat: 37.3496, lng: -121.9585 },
  'Los Gatos':     { city: 'Los Gatos',     zip: '95030', lat: 37.2266, lng: -121.9747 },
  Milpitas:        { city: 'Milpitas',      zip: '95035', lat: 37.4323, lng: -121.8996 },
  'Mountain View': { city: 'Mountain View', zip: '94040', lat: 37.3773, lng: -122.0862 },
};

const base = {
  name: 'Maya', types: ['paid','internship','volunteer'] as const,
  availability: ['weekends','after_school'] as const,
  interests: [], transportation: [], skills: [], thingsDone: [],
};

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) { failures++; console.log(`FAIL ${label} ${detail}`); }
  else console.log(`ok   ${label}`);
};

const main = async () => {
  /* Reset to exactly the fixture first. This suite compares SQL against the
     in-memory rules, so a row created by any other test — an admin-assisted
     posting, an employer's own — reads as a disagreement when it is nothing
     of the sort. That is precisely how this suite first went red. */
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await isolateFixture(client);
    await seedFixture(client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  for (const [placeName, loc] of Object.entries(PLACES)) {
    for (const radiusMiles of [3, 5, 10, 25]) {
      for (const age of [15, 16, 17, 18]) {
        const student = { ...base, age, searchLocation: loc, radiusMiles } as unknown as StudentProfile;
        const input = { opportunities: OPPORTUNITIES, organizations: ORGANIZATIONS, student };

        const inMemory = matchFeed(input).map((r) => r.opportunity.id).sort();
        const fromDb = (await findEligible({ age, lat: loc.lat, lng: loc.lng, radiusMiles }))
          .map((r) => r.opportunity.id).sort();

        const label = `${placeName} r${radiusMiles} age${age} (${inMemory.length})`;
        check(label, JSON.stringify(inMemory) === JSON.stringify(fromDb),
          `\n     ts: ${inMemory.join(',')}\n     db: ${fromDb.join(',')}`);

        // distances must agree to within a rounding step, or the cards lie
        if (inMemory.length) {
          const tsById = new Map(matchFeed(input).map((r) => [r.opportunity.id, r.fit.distance]));
          const dbRows = await findEligible({ age, lat: loc.lat, lng: loc.lng, radiusMiles });
          const worst = Math.max(...dbRows.map((r) =>
            Math.abs((tsById.get(r.opportunity.id) ?? 0) - r.distanceMiles)));
          check(`  distances agree within 0.05mi (worst ${worst.toFixed(4)})`, worst < 0.05);
        }

        const next = [3,5,10,25].find((x) => x > radiusMiles) ?? 25;
        const tsBeyond = countBeyondRadius(input, next);
        const dbBeyond = await countBeyond({ age, lat: loc.lat, lng: loc.lng, radiusMiles }, next);
        check(`  beyond→${next}mi = ${tsBeyond}`, tsBeyond === dbBeyond, `db said ${dbBeyond}`);
      }
    }
  }

  // the two gates that exist for safety, not relevance
  const all = await findEligible({ age: 18, lat: 37.3496, lng: -121.9585, radiusMiles: 100 });
  check('unverified organization never returned',
    !all.some((r) => r.organization.verificationStatus !== 'VERIFIED'));
  check('non-published opportunity never returned',
    !all.some((r) => r.opportunity.status !== 'PUBLISHED'));
  check('the PENDING_REVIEW fixture is genuinely excluded',
    !all.some((r) => r.opportunity.id === 'opp-print-shop'));

  await getPool().end();
  console.log(failures === 0 ? '\nPARITY: identical on every case' : `\n${failures} MISMATCHES`);
  process.exit(failures === 0 ? 0 : 1);
};

main();
