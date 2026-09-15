import { strict as assert } from 'node:assert';
import { getPool, query } from '../lib/db';
import { createOrganization, createOpportunity } from '../lib/server/organizations';
import { createInterest, loadInterestedStudents } from '../lib/server/applications';
import { requestCode, verifyCode, userForToken, revokeSession } from '../lib/server/auth';
import { saveStudent } from '../lib/server/students';

/* Server-side properties, run against a real database with `npm run test:db`.
 *
 * These are the things that were true of the browser stub and have to stay
 * true now that they are real — plus the two that only became testable once
 * there was a server: that a code never leaves it, and that the employer
 * payload cannot carry a student's location. */

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) console.log(`ok   ${name}`);
  else { failures++; console.log(`FAIL ${name} ${detail}`); }
};

/* The first version of this helper tried to brute-force the code. It could
   not — the attempt cap stopped it at five, which is the property working.
   The only legitimate way in is the development flag the module itself gates,
   and the test below asserts that flag is what controls it. */

/* The first version of this cleanup used TRUNCATE ... users CASCADE, which
   followed opportunities.created_by_user_id and destroyed every seeded
   opportunity and organization with it. Run against anything real it would
   have emptied the marketplace. Scoped deletes, in dependency order, and a
   guard so the suite cannot point at a database that is not disposable. */
async function main() {
  const url = process.env.DATABASE_URL ?? '';
  const disposable = /localhost|127\.0\.0\.1/.test(url) || /test/i.test(url);
  if (!disposable) {
    throw new Error(
      'Refusing to run: this suite deletes rows and DATABASE_URL does not look like a local or test database',
    );
  }

  await query('DELETE FROM audit_log');
  await query('DELETE FROM events');
  await query('DELETE FROM applications');
  await query('DELETE FROM saved_opportunities');
  await query('DELETE FROM students');
  await query('DELETE FROM org_members');
  await query('DELETE FROM sessions');
  await query('DELETE FROM auth_challenges');
  /* Only what this suite created. The seed fixture is left alone. */
  await query("DELETE FROM opportunities WHERE creation_method <> 'SEED'");
  await query("DELETE FROM organizations WHERE id LIKE 'org\\_%'");
  await query('DELETE FROM users');

  // ── the code never reaches a caller unless a developer asked for it ──────
  {
    const saved = process.env.AUTH_DEV_CODES;
    delete process.env.AUTH_DEV_CODES;
    const quiet = await requestCode('email', 'silent@example.com');
    check('without the dev flag the response carries no code',
      quiet.ok && quiet.devCode === undefined);
    if (saved !== undefined) process.env.AUTH_DEV_CODES = saved;
    await query('DELETE FROM auth_challenges');
  }

  // ── contacts normalise, so one person is one account ──────────────────────
  const first = await requestCode('email', '  Nina@Example.COM ');
  assert.ok(first.ok);
  const nina = await query<{ contact: string }>('SELECT contact FROM auth_challenges WHERE id = $1', [first.challengeId]);
  check('contact normalised before storage', nina[0]?.contact === 'nina@example.com', nina[0]?.contact);

  // ── the code is never stored in the clear ────────────────────────────────
  const stored = await query<{ code_hash: string }>('SELECT code_hash FROM auth_challenges WHERE id = $1', [first.challengeId]);
  check('code stored hashed, not in the clear', /^[a-f0-9]{64}$/.test(stored[0]?.code_hash ?? ''));

  // ── attempts are capped and a spent challenge stays spent ────────────────
  for (let i = 0; i < 5; i++) await verifyCode(first.challengeId, '999999');
  const afterBurn = await verifyCode(first.challengeId, '999999');
  check('challenge burns out after five wrong attempts', !afterBurn.ok && afterBurn.attemptsLeft === 0);

  // ── the resend cooldown is server-side ───────────────────────────────────
  const second = await requestCode('email', 'nina@example.com');
  check('resend refused inside the cooldown', !second.ok && Boolean(second.retryAfterSeconds));

  // ── a good sign-in issues a working session ──────────────────────────────
  await query('DELETE FROM auth_challenges');
  const fresh = await requestCode('email', 'omar@example.com');
  assert.ok(fresh.ok);
  const code = fresh.devCode;
  check('development flag hands the code back for tests', typeof code === 'string' && code.length === 6);
  if (!code) throw new Error('AUTH_DEV_CODES=1 is required to run this suite');
  const signedIn = await verifyCode(fresh.challengeId, code);
  check('correct code signs in', signedIn.ok);
  if (!signedIn.ok) throw new Error('cannot continue without a session');

  const viaToken = await userForToken(signedIn.token);
  check('session token resolves to the user', viaToken?.id === signedIn.userId);

  // ── and the same code cannot be replayed ─────────────────────────────────
  const replay = await verifyCode(fresh.challengeId, code);
  check('a consumed challenge refuses its own correct code', !replay.ok);

  await revokeSession(signedIn.token);
  check('signing out kills the session', (await userForToken(signedIn.token)) === null);

  // ── the privacy envelope ─────────────────────────────────────────────────
  await saveStudent(signedIn.userId, {
    name: 'Omar', age: 16,
    searchLocation: { city: 'Santa Clara', zip: '95050', lat: 37.3496, lng: -121.9585 },
    radiusMiles: 10, types: ['paid'], availability: ['weekends'], interests: ['food'],
    transportation: ['bike'], skills: [], thingsDone: ['Babysitting'],
  });

  const orgId = await createOrganization(
    { name: 'Parity Test Cafe', kind: 'business', contactName: 'T', city: 'Santa Clara', zip: '95050' },
    null,
  );
  await query(`UPDATE organizations SET verification_status = 'VERIFIED' WHERE id = $1`, [orgId]);

  const { id: oppId } = await createOpportunity(
    {
      organizationId: orgId, title: 'Counter Help', type: 'paid', minimumAge: 15,
      experience: 'none', timing: ['weekends'], compensation: { kind: 'hourly', min: 20 },
      summary: '', reassurance: '', responsibilities: [], schedule: '', goodToKnow: [],
      interests: [], publishedAt: new Date().toISOString(),
    },
    { organizationId: orgId, createdByUserId: null, creationMethod: 'ADMIN_ASSISTED' },
  );

  const created = await createInterest(signedIn.userId, oppId, 'Keen');
  check('interest is recorded', created.ok);

  const students = await loadInterestedStudents(oppId);
  check('employer receives the interested student', students.length === 1);

  const payload = JSON.stringify(students);
  for (const secret of ['37.3496', '-121.9585', 'omar@example.com', '95050']) {
    check(`employer payload omits ${secret}`, !payload.includes(secret));
  }
  check('employer payload rounds distance', Number.isFinite(students[0]?.distanceMiles ?? NaN)
    && String(students[0]?.distanceMiles ?? '').split('.')[1]?.length !== 6);

  // ── the two gates that exist for safety ──────────────────────────────────
  const pendingOrg = await createOrganization(
    { name: 'Unverified Co', kind: 'business', contactName: 'T', city: 'Santa Clara', zip: '95050' },
    null,
  );
  const { status } = await createOpportunity(
    {
      organizationId: pendingOrg, title: 'Hidden', type: 'paid', minimumAge: 15,
      experience: 'none', timing: ['weekends'], compensation: { kind: 'hourly', min: 20 },
      summary: '', reassurance: '', responsibilities: [], schedule: '', goodToKnow: [],
      interests: [], publishedAt: new Date().toISOString(),
    },
    { organizationId: pendingOrg, createdByUserId: null, creationMethod: 'ADMIN_ASSISTED' },
  );
  check('a posting is never more trusted than its organization', status === 'PENDING_REVIEW');

  const tooYoung = await createInterest(signedIn.userId, oppId, null);
  check('a second interest does not create a second application', tooYoung.ok && tooYoung.alreadySent);

  await getPool().end();
  console.log(failures === 0 ? '\nSERVER: all properties hold' : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
