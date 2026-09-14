import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { nearbyLine, widenLabel } from '../lib/greeting';
import { OPPORTUNITIES, ORGANIZATIONS } from '../lib/data';
import { countBeyondRadius, matchFeed } from '../lib/matching';
import type { StudentProfile } from '../lib/types';

/* The line under the greeting is the first thing a student reads on every
   visit. It regresses silently — nothing crashes when a count reads badly —
   so the ladder is pinned here. */

describe('nearbyLine', () => {
  it('does not report a zero, and leaves the count to the empty panel', () => {
    assert.deepEqual(nearbyLine({ nearby: 0, beyond: 3, radiusMiles: 3, nextRadius: 5 }), {
      text: 'Nothing within 3 miles yet',
      offerToWiden: false,
    });
  });

  it('names the travel range rather than a number at the widest radius', () => {
    assert.equal(
      nearbyLine({ nearby: 0, beyond: 0, radiusMiles: 25, nextRadius: 25 }).text,
      'Nothing within your travel range yet',
    );
  });

  it('points past the radius when the market is thin and there is somewhere to point', () => {
    assert.deepEqual(nearbyLine({ nearby: 2, beyond: 10, radiusMiles: 5, nextRadius: 10 }), {
      text: '2 within 5 miles, and 10 more just past that',
      offerToWiden: true,
    });
  });

  it('offers no widening when there is nothing further out to find', () => {
    assert.deepEqual(nearbyLine({ nearby: 1, beyond: 0, radiusMiles: 10, nextRadius: 25 }), {
      text: '1 near you right now',
      offerToWiden: false,
    });
  });

  it('returns to a plain count at three, where a count reads as a choice', () => {
    assert.deepEqual(nearbyLine({ nearby: 3, beyond: 9, radiusMiles: 3, nextRadius: 5 }), {
      text: '3 opportunities near you',
      offerToWiden: false,
    });
    assert.equal(
      nearbyLine({ nearby: 18, beyond: 0, radiusMiles: 10, nextRadius: 25 }).text,
      '18 opportunities near you',
    );
  });

  it('singularises a count of one', () => {
    assert.equal(
      nearbyLine({ nearby: 1, beyond: 0, radiusMiles: 5, nextRadius: 10 }).text,
      '1 near you right now',
    );
  });

  /* The line may describe what is true now. It may not describe what might
     happen later — there is no data behind "more added every week", and a
     thin market is exactly where that lie would be most tempting. */
  it('never promises opportunities that do not exist yet', () => {
    const promises = /every week|check back|coming soon|more added|we'll add|new ones|soon/i;
    for (const nearby of [0, 1, 2, 3, 7, 40]) {
      for (const beyond of [0, 1, 5, 12]) {
        for (const radiusMiles of [3, 5, 10, 25]) {
          const { text } = nearbyLine({ nearby, beyond, radiusMiles, nextRadius: 25 });
          assert.ok(!promises.test(text), `promised something in: ${text}`);
        }
      }
    }
  });

  it('never states a number it was not given', () => {
    for (const nearby of [0, 2, 7]) {
      for (const beyond of [0, 4]) {
        for (const radiusMiles of [3, 10]) {
          const { text } = nearbyLine({ nearby, beyond, radiusMiles, nextRadius: 25 });
          const stated = (text.match(/\d+/g) ?? []).map(Number);
          for (const n of stated) {
            assert.ok(
              [nearby, beyond, radiusMiles].includes(n),
              `line stated ${n}, which it was not given: ${text}`,
            );
          }
        }
      }
    }
  });
});

describe('widenLabel', () => {
  it('names the next radius, and stops naming one at the widest', () => {
    assert.equal(widenLabel(5), 'Look 5 miles out');
    assert.equal(widenLabel(25), 'Look as far as I can get');
  });
});

describe('the seed set reaches the thin branch', () => {
  /* A ladder that no real location can land on is a ladder nobody has
     tested. Milpitas at five miles is genuinely thin against this data. */
  it('produces a thin-market line for a real place and radius', () => {
    const student: StudentProfile = {
      name: 'Maya',
      age: 16,
      searchLocation: { city: 'Milpitas', zip: '95035', lat: 37.4323, lng: -121.8996 },
      radiusMiles: 5,
      types: ['paid', 'internship', 'volunteer'],
      availability: ['weekends', 'after_school'],
      interests: [],
      transportation: [],
      skills: [],
      thingsDone: [],
    };
    const input = { opportunities: OPPORTUNITIES, organizations: ORGANIZATIONS, student };
    const line = nearbyLine({
      nearby: matchFeed(input).length,
      beyond: countBeyondRadius(input, 10),
      radiusMiles: student.radiusMiles,
      nextRadius: 10,
    });

    assert.equal(line.offerToWiden, true);
    assert.match(line.text, /^2 within 5 miles, and \d+ more just past that$/);
  });
});
