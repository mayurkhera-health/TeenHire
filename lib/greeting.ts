import { RADIUS_OPTIONS } from './sections';

/* The line under the greeting is the first thing a student reads on every
   visit, and a bare count is only good news when the count is good. In a thin
   market — which is every market on its first day — "1 opportunity near you"
   sets the expectation that the app is not worth opening again.
 *
 * Below the threshold the line stops reporting a total and starts pointing at
 * the next move. Everything it says is derived from what the feed actually
 * knows: how many are in range, and how many sit between here and the next
 * radius up. It never promises what has not happened yet — no "more added
 * every week", no "check back soon". A thin market is thin, and saying so
 * honestly while offering the one move that helps beats cheerfulness. */

/* At three a student has something to compare, which is the point at which a
   count reads as a selection rather than as scraps. */
const THIN_MARKET = 3;

export interface NearbySummary {
  /* Eligible and in range: what the feed can actually show. */
  nearby: number;
  /* Eligible, but between the current radius and the next one up. */
  beyond: number;
  radiusMiles: number;
  nextRadius: number;
}

export interface NearbyLine {
  text: string;
  /* True when widening is a real move — there is something out there to find.
     The feed turns this into a one-tap action rather than making a student go
     hunting through their profile for the radius control. */
  offerToWiden: boolean;
}

function rangePhrase(miles: number): string {
  const widest = RADIUS_OPTIONS[RADIUS_OPTIONS.length - 1] ?? 25;
  return miles >= widest ? 'your travel range' : `${miles} miles`;
}

export function nearbyLine({
  nearby,
  beyond,
  radiusMiles,
  nextRadius,
}: NearbySummary): NearbyLine {
  const canWiden = beyond > 0;

  if (nearby === 0) {
    /* The empty panel underneath carries the count and the action, so the
       line stays short rather than saying the same number twice. */
    return {
      text: `Nothing within ${rangePhrase(radiusMiles)} yet`,
      offerToWiden: false,
    };
  }

  if (nearby < THIN_MARKET) {
    const here = `${nearby} within ${rangePhrase(radiusMiles)}`;
    return canWiden
      ? { text: `${here}, and ${beyond} more just past that`, offerToWiden: true }
      : { text: `${nearby} near you right now`, offerToWiden: false };
  }

  return {
    text: `${nearby} ${nearby === 1 ? 'opportunity' : 'opportunities'} near you`,
    offerToWiden: false,
  };
}

export function widenLabel(nextRadius: number): string {
  const widest = RADIUS_OPTIONS[RADIUS_OPTIONS.length - 1] ?? 25;
  return nextRadius >= widest ? 'Look as far as I can get' : `Look ${nextRadius} miles out`;
}
