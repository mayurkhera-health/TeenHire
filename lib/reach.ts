import type { MinimumAge } from './types';

/* How many students a posting would actually reach.
 *
 * There is no student base to count yet, so `reachFor` reports that the
 * number is unknown and the posting flow shows the employer what their own
 * settings mean instead. An employer is deciding whether to commit on this
 * screen; an invented population figure is the worst possible thing to put
 * in front of that decision.
 *
 * Wiring this to real counts before launch is a change to one function. */

export interface ReachQuery {
  city: string;
  minimumAge: MinimumAge;
}

export type Reach = { known: true; count: number } | { known: false };

export function reachFor(_query: ReachQuery): Reach {
  /* The query this stands in for:
   *
   *   SELECT count(*) FROM student_profiles s
   *   WHERE s.age >= :minimumAge
   *     AND ST_DWithin(s.search_location, :organizationLocation,
   *                    s.radius_miles * 1609.34)
   *
   * Return { known: true, count } once that table has students in it. The
   * posting flow already renders both branches. */
  return { known: false };
}

const ALL_MINIMUM_AGES: MinimumAge[] = [15, 16, 17, 18];

/* Which students a minimum age shuts out. True by construction, whatever the
   student base turns out to be — which is why it is safe to show now. */
export function agesExcluded(minimumAge: MinimumAge): number[] {
  return ALL_MINIMUM_AGES.filter((age) => age < minimumAge);
}
