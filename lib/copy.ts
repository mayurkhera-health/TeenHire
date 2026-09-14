import type {
  Compensation,
  Experience,
  HoursBucket,
  Interest,
  OpportunityType,
  Timing,
  Transportation,
  VolunteerCommitment,
} from './types';

/* Student-facing language lives here so it can't drift screen to screen.
   Second person, present tense, one idea per sentence. Nothing in this file
   says "compensation", "qualifications" or "submit". */

export const TYPE_LABEL: Record<OpportunityType, string> = {
  paid: 'Paid job',
  internship: 'Internship',
  volunteer: 'Volunteer',
};

export const TYPE_BADGE: Record<OpportunityType, string> = {
  paid: 'Paid job',
  internship: 'Internship',
  volunteer: 'Volunteer',
};

export const TYPE_CLASS: Record<OpportunityType, string> = {
  paid: 'type-paid',
  internship: 'type-internship',
  volunteer: 'type-volunteer',
};

export const TIMING_LABEL: Record<Timing, string> = {
  after_school: 'After school',
  weekends: 'Weekends',
  summer: 'Summer',
  winter_break: 'Winter break',
  spring_break: 'Spring break',
  seasonal: 'Seasonal',
  year_round: 'Year-round',
  flexible: 'Flexible',
};

/* The six a student picks from during onboarding. Seasonal and year-round
   are employer-side attributes — a student has no use for them. */
export const STUDENT_TIMING: Timing[] = [
  'after_school',
  'weekends',
  'summer',
  'winter_break',
  'spring_break',
  'flexible',
];

export const EMPLOYER_TIMING: Timing[] = [
  'after_school',
  'weekends',
  'summer',
  'winter_break',
  'spring_break',
  'year_round',
  'flexible',
];

export const INTEREST_LABEL: Record<Interest, string> = {
  sports: 'Sports',
  food: 'Food',
  technology: 'Technology',
  animals: 'Animals',
  healthcare: 'Healthcare',
  kids: 'Kids',
  retail: 'Retail',
  outdoors: 'Outdoors',
  business: 'Business',
  arts: 'Arts',
  community: 'Community',
  education: 'Education',
};

export const ALL_INTERESTS = Object.keys(INTEREST_LABEL) as Interest[];

export const TRANSPORT_LABEL: Record<Transportation, string> = {
  walk: 'Walk',
  bike: 'Bike',
  transit: 'Transit',
  ride: 'Parent / family ride',
  drive: 'I drive',
};

export const TRANSPORT_ORDER: Transportation[] = ['walk', 'bike', 'transit', 'ride', 'drive'];

export const EXPERIENCE_LABEL: Record<Experience, string> = {
  none: 'No experience needed',
  some: 'Some experience preferred',
  required: 'Experience needed',
};

export const EXPERIENCE_EMPLOYER_LABEL: Record<Experience, string> = {
  none: 'No — first job is fine',
  some: 'Some experience preferred',
  required: 'Yes',
};

export const HOURS_LABEL: Record<HoursBucket, string> = {
  under_10: 'Under 10 hrs a week',
  '10_20': '10–20 hrs a week',
  '20_plus': '20+ hrs a week',
  varies: 'Hours vary',
};

export const COMMITMENT_LABEL: Record<VolunteerCommitment, string> = {
  one_time: 'One time',
  weekly: 'Weekly',
  monthly: 'Monthly',
  flexible: 'Flexible',
};

/* Representative hours per bucket, used only to translate a rate into
   something a student can picture. It is always hedged with "about". */
const HOURS_ESTIMATE: Record<HoursBucket, number> = {
  under_10: 8,
  '10_20': 15,
  '20_plus': 24,
  varies: 12,
};

export function payHeadline(compensation: Compensation): string {
  switch (compensation.kind) {
    case 'hourly':
      return compensation.max && compensation.max !== compensation.min
        ? `$${compensation.min}–$${compensation.max}/hr`
        : `$${compensation.min}/hr`;
    case 'stipend':
      return `$${compensation.amount} stipend`;
    case 'unpaid':
      return 'Unpaid internship';
    case 'commitment':
      return COMMITMENT_LABEL[compensation.commitment];
  }
}

/* "$20/hr" is a number. "about $160 a weekend" is a thing a student can
   picture, and it is the reason the money block exists. */
export function payTranslation(
  compensation: Compensation,
  timing: Timing[],
  hours: HoursBucket | undefined,
): string | null {
  if (compensation.kind === 'stipend') {
    return `Paid as one ${compensation.per === 'total' ? 'lump sum' : compensation.per} amount`;
  }
  if (compensation.kind !== 'hourly') return null;

  const bucket = hours ?? 'varies';
  const estimate = compensation.min * HOURS_ESTIMATE[bucket];
  const rounded = Math.round(estimate / 5) * 5;

  const weekendOnly = timing.includes('weekends') && !timing.includes('after_school');
  return `about $${rounded} a ${weekendOnly ? 'weekend' : 'week'}`;
}

export function listPhrase(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0] as string;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function timingPhrase(timing: Timing[]): string {
  return timing.map((t) => TIMING_LABEL[t]).join(' + ');
}

export function initials(name: string): string {
  const parts = name.replace(/[^\p{L}\s]/gu, '').split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return (parts[0] as string).slice(0, 2).toUpperCase();
  return `${(parts[0] as string)[0]}${(parts[1] as string)[0]}`.toUpperCase();
}

export function daysAgo(iso: string, now = new Date()): number {
  const then = new Date(iso).getTime();
  return Math.floor((now.getTime() - then) / 86_400_000);
}

export function postedPhrase(iso: string, now = new Date()): string {
  const days = daysAgo(iso, now);
  if (days <= 0) return 'Posted today';
  if (days === 1) return 'Posted yesterday';
  if (days < 7) return `Posted ${days} days ago`;
  if (days < 14) return 'Posted last week';
  return `Posted ${Math.floor(days / 7)} weeks ago`;
}
