import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { OPPORTUNITIES, ORGANIZATIONS } from '../lib/data';
import { matchFeed } from '../lib/matching';
import {
  SMS_LIMIT,
  matchingEvent,
  mentionsStudent,
  smsText,
  summaryFor,
} from '../lib/notifications';
import type { NotificationPreferences, StudentProfile } from '../lib/types';

const student: StudentProfile = {
  name: 'Maya',
  age: 16,
  searchLocation: { city: 'Santa Clara', zip: '95050', lat: 37.3496, lng: -121.9585 },
  radiusMiles: 10,
  types: ['paid', 'internship', 'volunteer'],
  availability: ['weekends', 'after_school'],
  interests: [],
  transportation: [],
  skills: [],
  thingsDone: [],
};

const input = { opportunities: OPPORTUNITIES, organizations: ORGANIZATIONS, student };
const prefs = (over: Partial<NotificationPreferences> = {}): NotificationPreferences => ({
  types: ['paid', 'internship', 'volunteer'],
  frequency: 'immediately',
  ...over,
});

describe('matchingEvent', () => {
  it('notifies a student about something they can actually do', () => {
    const n = matchingEvent(input, 'opp-smoothie', prefs());
    assert.ok(n);
    assert.equal(n.event, 'NEW_MATCH_AVAILABLE');
    assert.match(n.headline, /from you$/);
    assert.match(n.detail, /Smoothie Team Member/);
    assert.match(n.detail, /16\+/);
  });

  /* The whole point of raising the event through the same rules as the feed:
     a student can never be told about something the app would then refuse to
     show them. */
  it('stays silent about an opportunity the student is too young for', () => {
    assert.equal(matchingEvent(input, 'opp-shift-lead', prefs()), null);
  });

  it('stays silent about an organization that is not verified', () => {
    assert.equal(matchingEvent(input, 'opp-print-shop', prefs()), null);
  });

  it('stays silent about something out of travel range', () => {
    const near = { ...input, student: { ...student, radiusMiles: 3 } };
    const inRange = matchFeed(near).some((r) => r.opportunity.id === 'opp-trail');
    assert.equal(inRange, false, 'fixture assumption: opp-trail is beyond 3 miles');
    assert.equal(matchingEvent(near, 'opp-trail', prefs()), null);
  });

  it('honours opting out entirely', () => {
    assert.equal(matchingEvent(input, 'opp-smoothie', prefs({ frequency: 'off' })), null);
  });

  it('honours opting out of a single type', () => {
    assert.equal(matchingEvent(input, 'opp-smoothie', prefs({ types: ['volunteer'] })), null);
    assert.ok(matchingEvent(input, 'opp-shelter-care', prefs({ types: ['volunteer'] })));
  });

  it('sends SMS only to students who asked to hear right away', () => {
    assert.equal(matchingEvent(input, 'opp-smoothie', prefs())?.channel, 'SMS');
    assert.equal(matchingEvent(input, 'opp-smoothie', prefs({ frequency: 'daily' }))?.channel, 'EMAIL');
  });

  it('leads a volunteer message with the organization, not a wage', () => {
    const n = matchingEvent(input, 'opp-shelter-care', prefs());
    assert.ok(n);
    assert.match(n.headline, /^Volunteer opportunity/);
    assert.match(n.detail, /Paws & Whiskers Rescue/);
    assert.ok(!/\$/.test(n.detail), 'a volunteer message must not quote money');
  });
});

/* These exist because the suite above passed on copy that read
   "New weekends job Right here from you". Matching /from you$/ was true of a
   broken sentence, so the assertions now describe the sentence rather than
   its ending. */
describe('headlines read as sentences', () => {
  it('uses an adjective, not a chip label, for the timing', () => {
    const n = matchingEvent(input, 'opp-smoothie', prefs());
    assert.ok(n);
    assert.ok(!/\bweekends\b/.test(n.headline), `chip label leaked: ${n.headline}`);
  });

  it('drops the timing when several apply rather than joining them', () => {
    for (const opportunity of OPPORTUNITIES) {
      const n = matchingEvent(input, opportunity.id, prefs());
      if (!n) continue;
      assert.ok(!n.headline.includes(' + '), `joined list in: ${n.headline}`);
    }
  });

  /* formatDistance answers "Right here" under a tenth of a mile, which the
     "X from you" template turned into "Right here from you". */
  it('says nearby instead of forcing a phrase into a distance slot', () => {
    /* Standing on an organization's doorstep. The nearest fixture org is 0.2
       miles from the default student, so searching from their own coordinates
       is the only way to reach the branch at all — a version of this test that
       used the default location asserted nothing. */
    const host = ORGANIZATIONS.find((o) => o.verificationStatus === 'VERIFIED');
    assert.ok(host, 'fixture assumption: at least one verified organization');
    const onTop = {
      ...input,
      student: {
        ...student,
        age: 18,
        searchLocation: { ...student.searchLocation, lat: host.location.lat, lng: host.location.lng },
      },
    };

    const theirs = OPPORTUNITIES.filter((o) => o.organizationId === host.id);
    let reached = 0;
    for (const opportunity of theirs) {
      const n = matchingEvent(onTop, opportunity.id, prefs());
      if (!n) continue;
      reached += 1;
      assert.ok(!/Right here from you/.test(n.headline), n.headline);
      assert.match(n.headline, /nearby$/);
    }
    assert.ok(reached > 0, 'the zero-distance branch was never exercised');
  });

  it('never doubles a space or leaves a dangling one', () => {
    for (const opportunity of OPPORTUNITIES) {
      const n = matchingEvent(input, opportunity.id, prefs());
      if (!n) continue;
      assert.ok(!/ {2}/.test(n.headline), `double space: "${n.headline}"`);
      assert.equal(n.headline, n.headline.trim());
    }
  });
});

describe('message composition', () => {
  it('fits one SMS segment for every published opportunity', () => {
    for (const opportunity of OPPORTUNITIES) {
      const n = matchingEvent(input, opportunity.id, prefs());
      if (!n) continue;
      const text = smsText(n);
      assert.ok(
        text.length <= SMS_LIMIT,
        `${opportunity.id} composes ${text.length} chars: ${text}`,
      );
    }
  });

  /* §36: nothing about the student travels in a message. Their name, ZIP and
     search coordinates are the things most likely to slip in by accident. */
  it('never describes the student', () => {
    for (const opportunity of OPPORTUNITIES) {
      const n = matchingEvent(input, opportunity.id, prefs());
      if (!n) continue;
      assert.equal(mentionsStudent(n, student), false, `leaked in ${opportunity.id}`);
    }
  });
});

describe('summaryFor', () => {
  it('batches for a student on a daily summary', () => {
    const since = new Date(Date.now() - 7 * 86_400_000);
    const n = summaryFor(input, prefs({ frequency: 'daily' }), since);
    assert.ok(n);
    assert.match(n.headline, /new opportunit/);
    assert.match(n.detail, /^Closest is /);
  });

  it('does not batch for a student who wants messages right away', () => {
    const since = new Date(Date.now() - 7 * 86_400_000);
    assert.equal(summaryFor(input, prefs({ frequency: 'immediately' }), since), null);
  });

  it('sends nothing when nothing new arrived', () => {
    const since = new Date(Date.now() + 86_400_000);
    assert.equal(summaryFor(input, prefs({ frequency: 'weekly' }), since), null);
  });
});
