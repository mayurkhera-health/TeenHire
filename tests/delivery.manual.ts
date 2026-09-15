import { getPool, query } from '../lib/db';
import { createOrganization, createOpportunity } from '../lib/server/organizations';
import { requestCode, verifyCode } from '../lib/server/auth';
import { saveStudent } from '../lib/server/students';
import { audienceFor, preferencesFor, savePreferences } from '../lib/server/audience';
import {
  compose,
  deliverDue,
  queueNotification,
  recipientFor,
  MAX_ATTEMPTS,
} from '../lib/server/notify';
import { onOpportunityPublished } from '../lib/server/triggers';
import { RecordingProvider, setProvider } from '../lib/server/delivery';
import { signatureFor, unsubscribe, unsubscribeUrl } from '../lib/server/unsubscribe';
import { findEligible } from '../lib/repository';
import type { Notification } from '../lib/notifications';
import type { StudentProfile } from '../lib/types';

/* Delivery, against a real database.
 *
 * The composition rules have unit tests and always had them. What could not be
 * tested before is everything that happens once a message is real: who the
 * database says should hear about a posting, what stops the same message going
 * twice, and what happens when the provider says no. */

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) console.log(`ok   ${name}`);
  else { failures++; console.log(`FAIL ${name} ${detail}`); }
};

const SANTA_CLARA = { city: 'Santa Clara', zip: '95050', lat: 37.3496, lng: -121.9585 };

async function signUp(contact: string): Promise<string> {
  process.env.AUTH_DEV_CODES = '1';
  const challenge = await requestCode('email', contact);
  if (!challenge.ok || !challenge.devCode) throw new Error('could not raise a challenge');
  const session = await verifyCode(challenge.challengeId, challenge.devCode);
  if (!session.ok) throw new Error('could not sign in');
  return session.userId;
}

const profile = (over: Partial<StudentProfile> = {}): StudentProfile => ({
  name: 'Test', age: 16, searchLocation: SANTA_CLARA, radiusMiles: 10,
  types: ['paid', 'internship', 'volunteer'], availability: ['weekends'],
  interests: [], transportation: [], skills: [], thingsDone: [], ...over,
});

const aNotification = (over: Partial<Notification> = {}): Notification => ({
  event: 'NEW_MATCH_AVAILABLE', channel: 'EMAIL',
  headline: 'A thing happened', detail: 'Some detail', action: 'See it',
  href: '/discover', ...over,
});

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  if (!(/localhost|127\.0\.0\.1/.test(url) || /test/i.test(url))) {
    throw new Error('Refusing to run: DATABASE_URL does not look like a local or test database');
  }

  await query('DELETE FROM notification_deliveries');
  await query('DELETE FROM events');
  await query('DELETE FROM applications');
  await query('DELETE FROM saved_opportunities');
  await query('DELETE FROM students');
  await query('DELETE FROM org_members');
  await query('DELETE FROM sessions');
  await query('DELETE FROM auth_challenges');
  await query("DELETE FROM opportunities WHERE creation_method <> 'SEED'");
  await query("DELETE FROM organizations WHERE id LIKE 'org\\_%'");
  await query('DELETE FROM users');

  // ── a verified organization with one paid posting, 16+ ───────────────────
  const orgId = await createOrganization(
    { name: 'Notify Test Cafe', kind: 'business', contactName: 'T', city: 'Santa Clara', zip: '95050' },
    null,
  );
  await query(`UPDATE organizations SET verification_status = 'VERIFIED' WHERE id = $1`, [orgId]);

  const { id: oppId } = await createOpportunity(
    {
      organizationId: orgId, title: 'Counter Help', type: 'paid', minimumAge: 16,
      experience: 'none', timing: ['weekends'], compensation: { kind: 'hourly', min: 20 },
      summary: '', reassurance: '', responsibilities: [], schedule: '', goodToKnow: [],
      interests: [], publishedAt: new Date().toISOString(),
    },
    { organizationId: orgId, createdByUserId: null, creationMethod: 'ADMIN_ASSISTED' },
  );

  // ── who the audience query finds, and who it must not ────────────────────
  const wants = await signUp('wants@example.com');
  await saveStudent(wants, profile({ name: 'Wants' }));

  const optedOut = await signUp('quiet@example.com');
  await saveStudent(optedOut, profile({ name: 'Quiet' }));
  await savePreferences(optedOut, { types: ['paid'], frequency: 'off' });

  const wrongType = await signUp('volunteeronly@example.com');
  await saveStudent(wrongType, profile({ name: 'Volunteer' }));
  await savePreferences(wrongType, { types: ['volunteer'], frequency: 'daily' });

  const tooYoung = await signUp('young@example.com');
  await saveStudent(tooYoung, profile({ name: 'Young', age: 15 }));

  const tooFar = await signUp('far@example.com');
  await saveStudent(tooFar, profile({
    name: 'Far',
    searchLocation: { city: 'Gilroy', zip: '95020', lat: 37.0058, lng: -121.5683 },
  }));

  const audience = await audienceFor(oppId);
  const heard = new Set(audience.map((a) => a.userId));

  check('an eligible student who asked to hear is in the audience', heard.has(wants));
  check('a student who switched notifications off is not', !heard.has(optedOut));
  check('a student who opted out of this type is not', !heard.has(wrongType));
  check('a student below the minimum age is not', !heard.has(tooYoung));
  check('a student outside their own travel range is not', !heard.has(tooFar));

  // ── the property the whole feature rests on ──────────────────────────────
  /* A student may never be told about something the app would then refuse to
     show them. Checked against the feed's own query rather than against this
     module's idea of who qualifies. */
  {
    let contradictions = 0;
    for (const { userId } of audience) {
      const [s] = await query<{ age: number; lat: number; lng: number; radius_miles: number }>(
        `SELECT age, ST_Y(search_location::geometry) AS lat,
                ST_X(search_location::geometry) AS lng, radius_miles
         FROM students WHERE user_id = $1`,
        [userId],
      );
      if (!s) { contradictions++; continue; }
      const feed = await findEligible({
        age: s.age, lat: Number(s.lat), lng: Number(s.lng), radiusMiles: s.radius_miles,
      });
      if (!feed.some((row) => row.opportunity.id === oppId)) contradictions++;
    }
    check('everyone notified would also see it in their feed', contradictions === 0,
      `${contradictions} contradicted`);
  }

  // ── an unverified organization notifies nobody ───────────────────────────
  {
    await query(`UPDATE organizations SET verification_status = 'PENDING' WHERE id = $1`, [orgId]);
    check('an unverified organization reaches no one', (await audienceFor(oppId)).length === 0);
    await query(`UPDATE organizations SET verification_status = 'VERIFIED' WHERE id = $1`, [orgId]);
  }

  // ── a paused posting notifies nobody ─────────────────────────────────────
  {
    await query(`UPDATE opportunities SET status = 'PAUSED' WHERE id = $1`, [oppId]);
    check('a posting that is not live reaches no one', (await audienceFor(oppId)).length === 0);
    await query(`UPDATE opportunities SET status = 'PUBLISHED' WHERE id = $1`, [oppId]);
  }

  // ── preferences round-trip through the database, not the browser ─────────
  {
    const stored = await preferencesFor(optedOut);
    check('preferences are read back from the server', stored.frequency === 'off');
    const fresh = await preferencesFor(wants);
    check('a student who never chose gets the default', fresh.frequency === 'daily'
      && fresh.types.length === 3, JSON.stringify(fresh));
  }

  // ── the channel a student can actually receive ───────────────────────────
  {
    const viaEmail = await recipientFor(wants, 'SMS');
    check('an email-only account asking for SMS is sent email', viaEmail?.method === 'email');
    check('and it goes to the address they signed up with',
      viaEmail?.contact === 'wants@example.com', viaEmail?.contact);
    check('an unknown user has no recipient', (await recipientFor('nobody', 'EMAIL')) === null);
  }

  // ── dedupe ───────────────────────────────────────────────────────────────
  {
    const first = await queueNotification({
      userId: wants, notification: aNotification(), dedupeKey: 'TEST:once',
    });
    const second = await queueNotification({
      userId: wants, notification: aNotification(), dedupeKey: 'TEST:once',
    });
    check('the first queue succeeds', first.queued);
    check('the same key does not queue twice', !second.queued
      && second.queued === false && second.reason === 'duplicate');

    const counted = await query<{ count: string }>(
      `SELECT count(*)::text AS count FROM notification_deliveries WHERE dedupe_key = 'TEST:once'`,
    );
    check('and only one row exists', counted[0]?.count === '1', counted[0]?.count);
  }

  // ── sending, retrying, and giving up ─────────────────────────────────────
  {
    await query('DELETE FROM notification_deliveries');

    /* A transient failure. The message must survive it. */
    setProvider(new RecordingProvider(() => ({ ok: false, error: 'timeout', retryable: true })));
    await queueNotification({ userId: wants, notification: aNotification(), dedupeKey: 'TEST:retry' });
    await deliverDue();
    const [retrying] = await query<{ status: string; attempts: number; last_error: string; due_later: boolean }>(
      `SELECT status, attempts, last_error, next_attempt_at > now() AS due_later
       FROM notification_deliveries WHERE dedupe_key = 'TEST:retry'`,
    );
    check('a transient failure is kept for retry', retrying?.status === 'FAILED', retrying?.status);
    check('with the attempt counted', retrying?.attempts === 1);
    check('the error is recorded', retrying?.last_error === 'timeout');
    check('and it is not tried again immediately', retrying?.due_later === true);

    /* Nothing due, so a second pass must not touch it. */
    const quiet = await deliverDue();
    check('a worker pass does nothing while a retry is backing off', quiet.considered === 0);

    /* A permanent failure is not retried at all. */
    setProvider(new RecordingProvider(() => ({ ok: false, error: 'no such address', retryable: false })));
    await queueNotification({ userId: wants, notification: aNotification(), dedupeKey: 'TEST:dead' });
    await deliverDue();
    const [dead] = await query<{ status: string; attempts: number }>(
      `SELECT status, attempts FROM notification_deliveries WHERE dedupe_key = 'TEST:dead'`,
    );
    check('a permanent failure is given up on at once', dead?.status === 'SUPPRESSED', dead?.status);
    check('after exactly one attempt', dead?.attempts === 1);

    /* And a message that keeps failing stops eventually. */
    setProvider(new RecordingProvider(() => ({ ok: false, error: 'still down', retryable: true })));
    await queueNotification({ userId: wants, notification: aNotification(), dedupeKey: 'TEST:exhaust' });
    for (let i = 0; i < MAX_ATTEMPTS + 2; i++) {
      await query(
        `UPDATE notification_deliveries SET next_attempt_at = now() - interval '1 minute'
         WHERE dedupe_key = 'TEST:exhaust' AND status IN ('QUEUED','FAILED')`,
      );
      await deliverDue();
    }
    const [exhausted] = await query<{ status: string; attempts: number }>(
      `SELECT status, attempts FROM notification_deliveries WHERE dedupe_key = 'TEST:exhaust'`,
    );
    check('a message that keeps failing is eventually given up on',
      exhausted?.status === 'SUPPRESSED', exhausted?.status);
    check('after no more than the attempt limit', exhausted?.attempts === MAX_ATTEMPTS,
      String(exhausted?.attempts));

    /* The happy path, last, so a success cannot mask any of the above. */
    const recorder = new RecordingProvider();
    setProvider(recorder);
    await queueNotification({ userId: wants, notification: aNotification(), dedupeKey: 'TEST:good' });
    const run = await deliverDue();
    check('a good message is sent', run.sent === 1, JSON.stringify(run));
    check('the provider was handed the address', recorder.sent[0]?.contact === 'wants@example.com');
    const [sent] = await query<{ status: string; provider: string; sent_at: Date | null }>(
      `SELECT status, provider, sent_at FROM notification_deliveries WHERE dedupe_key = 'TEST:good'`,
    );
    check('and the row records who sent it and when',
      sent?.status === 'SENT' && sent?.provider === 'recording' && sent?.sent_at !== null);
  }


  // ── unsubscribe ──────────────────────────────────────────────────────────
  /* The link is followed from a mail client with no session, sometimes by the
     mailbox provider's own robot. So the only thing that can be trusted is the
     signature, and the only thing the signature authorises is switching
     notifications off. */
  {
    const quiet = await signUp('stopplease@example.com');
    await saveStudent(quiet, profile({ name: 'Quiet Please' }));

    check('a forged token changes nothing', (await unsubscribe(quiet, 'not-a-signature')) === false);
    check('and the student still hears things',
      (await preferencesFor(quiet)).frequency !== 'off');

    /* Another student's valid signature must not work on this one — the
       signature covers the id, so swapping the id invalidates it. */
    const other = await signUp('someoneelse@example.com');
    await saveStudent(other, profile({ name: 'Someone Else' }));
    check("another student's signature does not unsubscribe this one",
      (await unsubscribe(quiet, signatureFor(other))) === false);
    check('and they are still subscribed', (await preferencesFor(quiet)).frequency !== 'off');

    check('their own signature works', (await unsubscribe(quiet, signatureFor(quiet))) === true);
    check('and notifications are off', (await preferencesFor(quiet)).frequency === 'off');
    check('so the audience no longer includes them',
      !(await audienceFor(oppId)).some((a) => a.userId === quiet));

    const url = unsubscribeUrl(quiet, 'https://teenhire.example/');
    check('the link carries the id and the signature, and no doubled slash',
      url.startsWith('https://teenhire.example/unsubscribe?u=') && url.includes('&t='), url);
    check('the signature is not the id in disguise', !url.includes(`t=${quiet}`));
  }

  // ── every email says how to stop it ──────────────────────────────────────
  {
    const someone = await signUp('footer@example.com');
    await saveStudent(someone, profile({ name: 'Footer' }));
    const message = compose(aNotification(), 'email', someone);
    check('an email body carries an unsubscribe link', /Stop these emails: http/.test(message.text));
    check('and the header URL is set for one-click',
      typeof message.unsubscribeUrl === 'string' && message.unsubscribeUrl.includes('/unsubscribe?'));

    const text = compose(aNotification(), 'sms', someone);
    check('an SMS carries no unsubscribe header', text.unsubscribeUrl === undefined);
  }

  // ── the publish trigger, end to end ──────────────────────────────────────
  {
    await query('DELETE FROM notification_deliveries');
    const recorder = new RecordingProvider();
    setProvider(recorder);

    /* Recomputed here rather than reusing the audience captured at the top:
       the checks in between add students, and a stale count made this fail
       for a reason that had nothing to do with publishing. */
    const eligible = await audienceFor(oppId);
    const queued = await onOpportunityPublished(oppId);
    check('publishing queues one message per eligible student', queued === eligible.length,
      `${queued} queued for ${eligible.length} eligible`);

    /* Republishing must not tell the same people again. */
    const again = await onOpportunityPublished(oppId);
    check('republishing the same posting tells nobody twice', again === 0);

    const run = await deliverDue();
    check('the worker delivers them', run.sent === queued, JSON.stringify(run));
    /* The student who used the unsubscribe link must not be in the delivery
       table at all for this posting — not queued and suppressed, absent. */
    const reached = await query<{ user_id: string }>(
      `SELECT DISTINCT user_id FROM notification_deliveries
       WHERE event = 'NEW_MATCH_AVAILABLE'`,
    );
    const offCount = await query<{ count: string }>(
      `SELECT count(*)::text AS count FROM students WHERE notify_frequency = 'off'`,
    );
    const silenced = await query<{ user_id: string }>(
      `SELECT user_id FROM students WHERE notify_frequency = 'off'`,
    );
    check('there are students with notifications off to test against',
      Number(offCount[0]?.count ?? 0) > 0);
    check('and none of them received a match message',
      !reached.some((r) => silenced.some((sOff) => sOff.user_id === r.user_id)));

    /* §36, at the delivery layer this time: nothing that left the building
       describes the student it went to. */
    const bodies = await query<{ body: string; to_contact: string }>(
      'SELECT body, to_contact FROM notification_deliveries',
    );
    const leaked = bodies.filter((b) =>
      /Wants|95050|37\.3496|-121\.9585/.test(b.body));
    check('no delivered message describes its recipient', leaked.length === 0,
      JSON.stringify(leaked.map((l) => l.body)));
  }

  setProvider(null);
  await getPool().end();
  console.log(failures === 0 ? '\nDELIVERY: all properties hold' : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
