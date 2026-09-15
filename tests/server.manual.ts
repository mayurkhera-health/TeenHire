import { strict as assert } from 'node:assert';
import { getPool, query } from '../lib/db';
import {
  createOrganization,
  createOpportunity,
  loadPostingForEdit,
  setEmployerStatus,
  updatePosting,
} from '../lib/server/organizations';
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


  // ── Phase 3: an employer's reach stops at their own organization ─────────
  /* The interesting case is not that the guard says no. It is that the guard
     could be removed and these would still hold, because organization_id is
     in every WHERE clause. So the calls below go straight past the route. */
  {
    const otherOrg = await createOrganization(
      { name: 'Somebody Else Inc', kind: 'business', contactName: 'X', city: 'Santa Clara', zip: '95050' },
      null,
    );
    await query(`UPDATE organizations SET verification_status = 'VERIFIED' WHERE id = $1`, [otherOrg]);

    check('another organization cannot read the posting',
      (await loadPostingForEdit(otherOrg, oppId)) === null);

    const stolenEdit = await updatePosting(otherOrg, oppId, {
      title: 'Owned', summary: 'Owned', minimumAge: 18, experience: 'required',
      timing: ['weekends'], hours: null, compensation: { kind: 'hourly', min: 1 },
    });
    check('another organization cannot edit the posting', stolenEdit === false);

    const [untouched] = await query<{ title: string; minimum_age: number }>(
      'SELECT title, minimum_age FROM opportunities WHERE id = $1', [oppId]);
    check('the posting is unchanged after the attempt',
      untouched?.title !== 'Owned' && untouched?.minimum_age !== 18, JSON.stringify(untouched));

    const stolenPause = await setEmployerStatus(otherOrg, oppId, 'PAUSED');
    check('another organization cannot pause the posting', !stolenPause.ok);
    const [stillLive] = await query<{ status: string }>(
      'SELECT status FROM opportunities WHERE id = $1', [oppId]);
    check('the posting is still live after the attempt', stillLive?.status === 'PUBLISHED');
  }

  // ── an edit cannot rewrite where the posting came from ───────────────────
  {
    const [before] = await query<{ creation_method: string; created_by_user_id: string | null }>(
      'SELECT creation_method, created_by_user_id FROM opportunities WHERE id = $1', [oppId]);

    const edited = await updatePosting(orgId, oppId, {
      title: 'Counter Help', summary: 'Make drinks.', minimumAge: 16, experience: 'none',
      timing: ['weekends', 'after_school'], hours: '10_20', compensation: { kind: 'hourly', min: 19, max: 22 },
    });
    check('the owner can edit their own posting', edited);

    const [after] = await query<{
      title: string; minimum_age: number; creation_method: string; created_by_user_id: string | null;
    }>('SELECT title, minimum_age, creation_method, created_by_user_id FROM opportunities WHERE id = $1', [oppId]);
    check('the edit lands', after?.title === 'Counter Help' && after?.minimum_age === 16);
    check('provenance survives an edit',
      after?.creation_method === before?.creation_method
        && after?.created_by_user_id === before?.created_by_user_id);

    const timing = await query<{ timing: string }>(
      'SELECT timing FROM opportunity_timing WHERE opportunity_id = $1 ORDER BY timing', [oppId]);
    check('timing is replaced, not appended to',
      timing.length === 2 && timing.map((t) => t.timing).join(',') === 'after_school,weekends',
      JSON.stringify(timing));
  }

  // ── the edit screen can see who a raised age would cut out ──────────────
  {
    const editable = await loadPostingForEdit(orgId, oppId);
    check('the posting carries the ages already interested',
      (editable?.interestedAges.length ?? 0) === 1, JSON.stringify(editable?.interestedAges));
  }

  // ── raising the age marks existing interest, it does not delete it ───────
  /* The screen says the student stays and is flagged. This is the assertion
     that keeps that sentence true. */
  {
    await updatePosting(orgId, oppId, {
      title: 'Counter Help', summary: 'Make drinks.', minimumAge: 18, experience: 'none',
      timing: ['weekends'], hours: null, compensation: { kind: 'hourly', min: 19 },
    });
    const after = await loadInterestedStudents(oppId);
    check('a student who already applied is not dropped by a raised age', after.length === 1);
    check('and is marked as under the new minimum', after[0]?.belowMinimumAge === true);

    /* Put it back, so what follows sees the posting it expects. */
    await updatePosting(orgId, oppId, {
      title: 'Counter Help', summary: 'Make drinks.', minimumAge: 16, experience: 'none',
      timing: ['weekends', 'after_school'], hours: '10_20',
      compensation: { kind: 'hourly', min: 19, max: 22 },
    });
    const restored = await loadInterestedStudents(oppId);
    check('and the mark clears when the age comes back down',
      restored[0]?.belowMinimumAge === false);
  }

  // ── pause and resume, and the one transition verification guards ────────
  {
    const paused = await setEmployerStatus(orgId, oppId, 'PAUSED');
    check('the owner can pause', paused.ok);
    const [row] = await query<{ status: string }>('SELECT status FROM opportunities WHERE id = $1', [oppId]);
    check('a paused posting is paused', row?.status === 'PAUSED');

    const filled = await setEmployerStatus(orgId, oppId, 'FILLED');
    check('the owner can mark it filled', filled.ok);

    const back = await setEmployerStatus(orgId, oppId, 'PUBLISHED');
    check('a verified organization can put it back up', back.ok);
  }

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

  /* And it cannot get there sideways. Pausing and resuming is the obvious way
     an unverified organization would try to reach PUBLISHED without anyone
     reviewing it, so the publish transition checks verification rather than
     the create path alone. */
  {
    const { id: hiddenId } = await createOpportunity(
      {
        organizationId: pendingOrg, title: 'Also hidden', type: 'paid', minimumAge: 15,
        experience: 'none', timing: ['weekends'], compensation: { kind: 'hourly', min: 20 },
        summary: '', reassurance: '', responsibilities: [], schedule: '', goodToKnow: [],
        interests: [], publishedAt: new Date().toISOString(),
      },
      { organizationId: pendingOrg, createdByUserId: null, creationMethod: 'ADMIN_ASSISTED' },
    );
    const forced = await setEmployerStatus(pendingOrg, hiddenId, 'PUBLISHED');
    check('an unverified organization cannot publish its own posting', !forced.ok);
    const [still] = await query<{ status: string }>(
      'SELECT status FROM opportunities WHERE id = $1', [hiddenId]);
    check('the posting stays in review', still?.status === 'PENDING_REVIEW', still?.status);
  }

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
