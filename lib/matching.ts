import { distanceMiles } from './geo';
import { isVerified } from './types';
import type {
  Opportunity,
  Organization,
  StudentProfile,
  Timing,
} from './types';

/* V1 matching is deterministic and explainable. No model, no score, nothing
   a student could read as a judgement of them. Every line the eligibility
   panel shows is produced here, which is why the panel can never claim
   something the rules didn't actually check. */

export interface FitLine {
  ok: boolean;
  label: string;
}

export interface Fit {
  /* False only when a rule the platform can assert with certainty fails. */
  eligible: boolean;
  /* The single reason, when there is one. Never a list of shortcomings. */
  blocker: string | null;
  lines: FitLine[];
  distance: number;
  matchedTiming: Timing[];
}

export interface Ranked {
  opportunity: Opportunity;
  organization: Organization;
  fit: Fit;
}

const AVAILABILITY_ALWAYS_FITS: Timing[] = ['flexible', 'year_round'];

function timingOverlap(student: Timing[], opportunity: Timing[]): Timing[] {
  if (student.includes('flexible')) return opportunity;
  if (opportunity.some((t) => AVAILABILITY_ALWAYS_FITS.includes(t))) return student;
  return opportunity.filter((t) => student.includes(t));
}

/* Distance is measured from the student's search location, which is stored
   apart from anything an organization is ever shown. */
export function evaluateFit(
  opportunity: Opportunity,
  organization: Organization,
  student: StudentProfile,
): Fit {
  const distance = distanceMiles(student.searchLocation, organization.location);
  const oldEnough = student.age >= opportunity.minimumAge;
  const inRange = distance <= student.radiusMiles;
  const matchedTiming = timingOverlap(student.availability, opportunity.timing);
  const scheduleFits = matchedTiming.length > 0;

  /* Experience is treated as something the role wants, never as something
     the student lacks. It blocks only when the role genuinely requires it,
     and the wording stays on the organization's side of the sentence. */
  const experienceFits =
    opportunity.experience !== 'required' || student.hasSimilarExperience === true;

  const lines: FitLine[] = [
    { ok: oldEnough, label: oldEnough ? "You're old enough" : `Requires age ${opportunity.minimumAge}+` },
    {
      ok: inRange,
      label: inRange
        ? 'Within your travel range'
        : `${distance.toFixed(1)} miles out — past your ${student.radiusMiles}-mile range`,
    },
  ];

  if (scheduleFits) {
    lines.push({ ok: true, label: scheduleMatchLabel(matchedTiming) });
  } else {
    lines.push({ ok: false, label: 'Their hours may not line up with yours' });
  }

  if (opportunity.experience === 'none') {
    lines.push({ ok: true, label: 'No experience needed' });
  } else if (opportunity.experience === 'some') {
    lines.push({ ok: true, label: 'Some experience helps, but it is not required' });
  } else {
    lines.push({
      ok: experienceFits,
      label: experienceFits
        ? 'You have done something like this before'
        : "They're looking for someone who has done this before",
    });
  }

  /* Availability never blocks. A student is allowed to want something that
     doesn't fit their usual week — schedules move, and the platform is not
     in a position to tell them otherwise. */
  let blocker: string | null = null;
  if (!oldEnough) blocker = `Requires age ${opportunity.minimumAge}+`;
  else if (!inRange) blocker = `About ${distance.toFixed(1)} miles away`;
  else if (!experienceFits) blocker = 'They want someone with experience';

  return { eligible: blocker === null, blocker, lines, distance, matchedTiming };
}

function scheduleMatchLabel(matched: Timing[]): string {
  if (matched.includes('weekends')) return 'Matches your weekend availability';
  if (matched.includes('after_school')) return 'Works after school';
  if (matched.includes('summer')) return 'Runs over the summer';
  if (matched.includes('winter_break')) return 'Runs over winter break';
  if (matched.includes('spring_break')) return 'Runs over spring break';
  return 'Works with when you are free';
}

/* The ranking order is §48, in order: age, range, type, availability,
   interests, freshness. Each comparison is a tie-break on the one above it,
   so the result is stable and can be explained line by line. */
export function rank(a: Ranked, b: Ranked, student: StudentProfile, now: Date): number {
  const byEligibility = Number(b.fit.eligible) - Number(a.fit.eligible);
  if (byEligibility !== 0) return byEligibility;

  const typeWanted = (r: Ranked) => Number(student.types.includes(r.opportunity.type));
  const byType = typeWanted(b) - typeWanted(a);
  if (byType !== 0) return byType;

  const byAvailability = b.fit.matchedTiming.length - a.fit.matchedTiming.length;
  if (byAvailability !== 0) return byAvailability;

  const interestHits = (r: Ranked) =>
    r.opportunity.interests.filter((i) => student.interests.includes(i)).length;
  const byInterest = interestHits(b) - interestHits(a);
  if (byInterest !== 0) return byInterest;

  const byDistance = a.fit.distance - b.fit.distance;
  if (Math.abs(byDistance) > 0.05) return byDistance;

  return freshness(b.opportunity.publishedAt, now) - freshness(a.opportunity.publishedAt, now);
}

function freshness(iso: string, now: Date): number {
  return new Date(iso).getTime() - now.getTime();
}

export interface MatchInput {
  opportunities: Opportunity[];
  organizations: Organization[];
  student: StudentProfile;
  now?: Date;
}

/* The equivalent of the published-and-eligible query: age and range are
   applied as filters, exactly as they would be in SQL, so the feed can
   never show something the panel would then have to refuse. */
export function matchFeed({
  opportunities,
  organizations,
  student,
  now = new Date(),
}: MatchInput): Ranked[] {
  const orgById = new Map(organizations.map((o) => [o.id, o]));

  const evaluated: Ranked[] = [];
  for (const opportunity of opportunities) {
    if (opportunity.status !== 'PUBLISHED') continue;
    const organization = orgById.get(opportunity.organizationId);
    if (!organization || !isVerified(organization)) continue;

    const fit = evaluateFit(opportunity, organization, student);
    if (student.age < opportunity.minimumAge) continue;
    if (fit.distance > student.radiusMiles) continue;

    evaluated.push({ opportunity, organization, fit });
  }

  return evaluated.sort((a, b) => rank(a, b, student, now));
}

/* Everything inside the radius that the student has not narrowed away — used
   to tell an empty state how many results the next radius up would add. */
export function countBeyondRadius(
  { opportunities, organizations, student }: MatchInput,
  radius: number,
): number {
  const orgById = new Map(organizations.map((o) => [o.id, o]));
  return opportunities.filter((opportunity) => {
    if (opportunity.status !== 'PUBLISHED') return false;
    const organization = orgById.get(opportunity.organizationId);
    if (!organization || !isVerified(organization)) return false;
    if (student.age < opportunity.minimumAge) return false;
    const d = distanceMiles(student.searchLocation, organization.location);
    return d > student.radiusMiles && d <= radius;
  }).length;
}

/* A student who lands on something they cannot do — usually through a link a
   friend sent — is at a dead end. Counting what they CAN do turns that into
   the most useful screen in the product, so the count has to be real: it runs
   the same rules the feed does, not an estimate. */
export function countEligibleAlternatives(
  { opportunities, organizations, student }: MatchInput,
  excludeId: string,
): number {
  return matchFeed({ opportunities, organizations, student }).filter(
    (r) => r.opportunity.id !== excludeId,
  ).length;
}

/* The same, narrowed to opportunities that look like the one they wanted —
   same type first, because someone who clicked a paid job wants a paid job. */
export function similarEligible(
  input: MatchInput,
  opportunity: Opportunity,
): Ranked[] {
  const feed = matchFeed(input).filter((r) => r.opportunity.id !== opportunity.id);
  const sameType = feed.filter((r) => r.opportunity.type === opportunity.type);
  return sameType.length >= 2 ? sameType : feed;
}
