import { EXPERIENCE_LABEL, payHeadline } from './copy';
import { formatDistance } from './geo';
import { matchFeed, type MatchInput, type Ranked } from './matching';
import type {
  NotificationPreferences,
  Timing,
  Opportunity,
  Organization,
  StudentProfile,
} from './types';

/* Differentiator #5: opportunities come to students, rather than students
   coming to a search box.
 *
 * Kept deliberately apart from opportunity and application logic — this module
 * decides who hears about what and in what words, and knows nothing about how
 * anything is stored. Delivery (email, SMS, later push) is a backend concern;
 * everything here is pure and testable, which is what stops a message going
 * out that says something the rules never checked. */

export type NotificationEvent =
  | 'OPPORTUNITY_PUBLISHED'
  | 'NEW_MATCH_AVAILABLE'
  | 'APPLICATION_SUBMITTED'
  | 'APPLICATION_VIEWED'
  | 'EMPLOYER_INTERESTED'
  | 'APPLICATION_STATUS_CHANGED';

export type Channel = 'EMAIL' | 'SMS';

export interface Notification {
  event: NotificationEvent;
  channel: Channel;
  /* One line. A student reading this on a lock screen decides in about a
     second whether to open it. */
  headline: string;
  detail: string;
  action: string;
  href: string;
}

/* SMS segments at 160 characters. A message that splits reads as two
   half-messages on some handsets, so composition is capped, not truncated
   afterwards — anything that would overflow is written shorter instead. */
export const SMS_LIMIT = 160;

export function smsText(notification: Notification): string {
  return `${notification.headline}\n${notification.detail}\n${notification.action} →`;
}

/* §19: publishing an opportunity raises a matching event. The students it
   finds are never exposed to the organization — this returns notifications,
   not an audience list. */
export function matchingEvent(
  input: MatchInput,
  opportunityId: string,
  preferences: NotificationPreferences,
): Notification | null {
  if (preferences.frequency === 'off') return null;

  const match = matchFeed(input).find((r) => r.opportunity.id === opportunityId);
  /* Not eligible, out of range, or from an unverified organization — the same
     rules the feed runs, so a student is never told about something the app
     would then refuse to show them. */
  if (!match) return null;

  if (!preferences.types.includes(match.opportunity.type)) return null;

  return newMatch(match, preferences.frequency === 'immediately' ? 'SMS' : 'EMAIL');
}

/* A headline is a sentence, and the label maps are not built for sentences.
 *
 * "New weekends job Right here from you" is what the first version produced:
 * TIMING_LABEL is written for chips, where "Weekends" is a noun on its own,
 * and formatDistance returns a phrase rather than a number, so the "X from
 * you" template had nothing to slot into. Both are real messages that went out
 * in testing. These two helpers exist so the sentence reads like one. */

const TIMING_ADJECTIVE: Partial<Record<Timing, string>> = {
  after_school: 'after-school',
  weekends: 'weekend',
  summer: 'summer',
  winter_break: 'winter break',
  spring_break: 'spring break',
  seasonal: 'seasonal',
};

/* Only when one applies. A posting tagged for weekends, after school and the
   summer is not a "weekend job", and stringing all three together is worse
   than saying nothing — the detail line lists them properly anyway. */
function timingAdjective(timing: Timing[]): string | null {
  const [only] = timing;
  return timing.length === 1 && only ? TIMING_ADJECTIVE[only] ?? null : null;
}

function sentenceCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function distancePhrase(miles: number): string {
  return miles < 0.1 ? 'nearby' : `${formatDistance(miles)} from you`;
}

export function newMatch(ranked: Ranked, channel: Channel): Notification {
  const { opportunity, organization, fit } = ranked;
  const where = distancePhrase(fit.distance);
  const adjective = timingAdjective(opportunity.timing);

  const headline =
    opportunity.type === 'volunteer'
      ? `${adjective ? `${sentenceCase(adjective)} volunteer` : 'Volunteer'} opportunity ${where}`
      : `New ${adjective ? `${adjective} ` : ''}${
          opportunity.type === 'internship' ? 'internship' : 'job'
        } ${where}`;

  const parts = [
    opportunity.type === 'volunteer' ? organization.name : opportunity.title,
    `${opportunity.minimumAge}+`,
    opportunity.type === 'volunteer'
      ? formatDistance(fit.distance)
      : payHeadline(opportunity.compensation),
  ];
  if (opportunity.experience === 'none' && opportunity.type !== 'volunteer') {
    parts.push('No experience needed');
  }

  return {
    event: 'NEW_MATCH_AVAILABLE',
    channel,
    headline,
    detail: parts.join(' • '),
    action: 'See it',
    href: `/opportunity/${opportunity.id}`,
  };
}

/* The application-side events. A student hears about their own application;
   an organization hears about interest in their own posting. Neither ever
   learns anything about the other that the privacy rules do not allow.

   Takes only the two fields it names rather than a Ranked. It never reads the
   fit, and asking for one would force every caller to have a student profile
   in hand just to say "this was sent". A Ranked still satisfies this. */
export function applicationEvent(
  event: Extract<
    NotificationEvent,
    'APPLICATION_SUBMITTED' | 'APPLICATION_VIEWED' | 'EMPLOYER_INTERESTED'
  >,
  subject: { opportunity: Pick<Opportunity, 'title'>; organization: Pick<Organization, 'name'> },
  channel: Channel = 'EMAIL',
): Notification {
  const { opportunity, organization } = subject;
  const href = `/activity`;

  switch (event) {
    case 'APPLICATION_SUBMITTED':
      return {
        event,
        channel,
        headline: `Sent to ${organization.name}`,
        detail: `${opportunity.title} • they usually reply within a few days`,
        action: 'See it',
        href,
      };
    case 'APPLICATION_VIEWED':
      return {
        event,
        channel,
        headline: `${organization.name} opened your profile`,
        detail: `${opportunity.title} • nothing to do yet`,
        action: 'See it',
        href,
      };
    case 'EMPLOYER_INTERESTED':
      return {
        event,
        channel,
        headline: `${organization.name} would like to speak with you`,
        /* The old line said "check your email for the next step", inside the
           email. §34's details live in the app, where they are attached to the
           application they belong to and cannot be forwarded out of an inbox
           by somebody who is not the student. */
        detail: `${opportunity.title} • their phone number and who to ask for are in your Activity`,
        action: 'See how to reach them',
        href,
      };
  }
}

/* What the student has actually asked to hear about. Opting out is one tap in
   the app and must hold everywhere — a "daily summary" student never gets an
   SMS, and "off" means off. */
export function channelFor(preferences: NotificationPreferences): Channel | null {
  if (preferences.frequency === 'off') return null;
  return preferences.frequency === 'immediately' ? 'SMS' : 'EMAIL';
}

export function summaryFor(
  input: MatchInput,
  preferences: NotificationPreferences,
  since: Date,
): Notification | null {
  const channel = channelFor(preferences);
  if (channel === null || preferences.frequency === 'immediately') return null;

  const fresh = matchFeed(input).filter(
    (r) =>
      new Date(r.opportunity.publishedAt) >= since &&
      preferences.types.includes(r.opportunity.type),
  );
  if (fresh.length === 0) return null;

  const nearest = fresh.reduce((a, b) => (a.fit.distance <= b.fit.distance ? a : b));

  return {
    event: 'NEW_MATCH_AVAILABLE',
    channel,
    headline:
      fresh.length === 1
        ? `1 new opportunity near you`
        : `${fresh.length} new opportunities near you`,
    detail: `Closest is ${nearest.opportunity.title} at ${formatDistance(nearest.fit.distance)}`,
    action: 'See them',
    href: '/discover',
  };
}

/* Used by the tests to prove a student is never described in a message. */
export function mentionsStudent(notification: Notification, student: StudentProfile): boolean {
  const text = `${notification.headline} ${notification.detail}`.toLowerCase();
  return (
    text.includes(student.name.toLowerCase()) ||
    text.includes(student.searchLocation.zip) ||
    text.includes(String(student.searchLocation.lat)) ||
    text.includes(String(student.searchLocation.lng))
  );
}

export { EXPERIENCE_LABEL };
