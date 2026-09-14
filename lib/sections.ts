import { INTEREST_LABEL, TIMING_LABEL, TYPE_LABEL, daysAgo } from './copy';
import type { Ranked } from './matching';
import type { OpportunityType, Timing } from './types';

/* Named collections, not saved searches and not opportunity types. The home
   screen is a set of answers to "what can I do near me", each one already
   filtered down to something a student can read in a glance. */

export interface FeedSection {
  id: string;
  title: string;
  /* What the section shows by default: never more than four cards. */
  items: Ranked[];
  /* Everything the section could show, for when "See all" is tapped. */
  allItems: Ranked[];
  /* Compact rows are used for secondary sections and for volunteer. */
  compact?: boolean;
}

const MIN_ITEMS = 2;
const MAX_ITEMS = 4;

export interface SectionInput {
  ranked: Ranked[];
  availability: Timing[];
  now?: Date;
}

export function buildSections({ ranked, availability, now = new Date() }: SectionInput): FeedSection[] {
  const candidates: Omit<FeedSection, 'allItems'>[] = [
    {
      id: 'close',
      title: 'Close to you',
      items: ranked.filter((r) => r.fit.distance <= 3),
    },
    {
      id: 'schedule',
      title: 'Works with your schedule',
      items: ranked.filter((r) => r.fit.matchedTiming.length > 0 && availability.length > 0),
    },
    {
      id: 'first',
      title: 'Good first jobs',
      items: ranked.filter((r) => r.opportunity.experience === 'none'),
    },
    {
      id: 'new',
      title: 'New this week',
      items: ranked.filter((r) => daysAgo(r.opportunity.publishedAt, now) <= 7),
    },
    {
      id: 'volunteer',
      title: 'Volunteer near you',
      items: ranked.filter((r) => r.opportunity.type === 'volunteer'),
      compact: true,
    },
  ];

  /* A section repeating the one above it teaches a student nothing, so once
     an opportunity has been shown it stops competing for the next slot —
     except in Volunteer, which is the only home for those listings. */
  const shown = new Set<string>();
  const sections: FeedSection[] = [];

  for (const section of candidates) {
    const fresh = section.compact
      ? section.items
      : section.items.filter((r) => !shown.has(r.opportunity.id));

    if (fresh.length < MIN_ITEMS) continue;

    const items = fresh.slice(0, MAX_ITEMS);
    fresh.forEach((r) => shown.add(r.opportunity.id));
    sections.push({ ...section, items, allItems: fresh });

    if (sections.length === 5) break;
  }

  return sections;
}

/* ---------- Filters. Four of them, and there will not be a fifth. ---------- */

export interface Filters {
  types: OpportunityType[];
  radius: number | null;
  timing: Timing[];
}

export const EMPTY_FILTERS: Filters = { types: [], radius: null, timing: [] };

export const FILTER_TIMING: Timing[] = ['after_school', 'weekends', 'summer', 'winter_break'];

export const RADIUS_OPTIONS = [3, 5, 10, 25] as const;

export function radiusLabel(miles: number): string {
  return miles >= 25 ? '15+ miles' : `${miles} miles`;
}

export function applyFilters(ranked: Ranked[], filters: Filters): Ranked[] {
  return ranked.filter(({ opportunity, fit }) => {
    if (filters.types.length > 0 && !filters.types.includes(opportunity.type)) return false;
    if (filters.radius !== null && fit.distance > filters.radius) return false;
    if (filters.timing.length > 0 && !filters.timing.some((t) => opportunity.timing.includes(t))) {
      return false;
    }
    return true;
  });
}

export function activeFilterCount(filters: Filters): number {
  return filters.types.length + filters.timing.length + (filters.radius === null ? 0 : 1);
}

/* Search exists, but it is the second way in, not the first. It reads over
   the things a student would actually type: a place, a role, an interest. */
export function searchRanked(ranked: Ranked[], query: string): Ranked[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return ranked;

  return ranked.filter(({ opportunity, organization }) => {
    const haystack = [
      opportunity.title,
      opportunity.summary,
      organization.name,
      organization.location.city,
      TYPE_LABEL[opportunity.type],
      ...opportunity.interests.map((i) => INTEREST_LABEL[i]),
      ...opportunity.timing.map((t) => TIMING_LABEL[t]),
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(q);
  });
}
