import type {
  Compensation,
  Experience,
  HoursBucket,
  MinimumAge,
  Opportunity,
  OpportunityStatus,
  Timing,
  VerificationStatus,
  VolunteerCommitment,
  OpportunityType,
} from './types';

/* §28: the form, and later voice, a pasted description and an imported URL,
   all produce this one draft, and this one function turns it into an
   Opportunity. Nothing downstream can tell which route a posting came in
   through, which is the property that keeps a second input method from
   quietly growing a second opportunity model behind it. */

export type DraftSource = 'form' | 'voice' | 'paste' | 'import';

export interface OpportunityDraft {
  source: DraftSource;
  type: OpportunityType | null;
  title: string;
  summary: string;
  minimumAge: MinimumAge | null;
  experience: Experience | null;
  timing: Timing[];
  hours: HoursBucket | null;
  compensation: Compensation | null;
}

export interface DraftProblem {
  field: keyof OpportunityDraft;
  message: string;
}

/* Every route has to be told the same thing is missing, in the same words —
   including a voice draft, where the gap is the machine's fault rather than
   the employer's and the wording should not imply otherwise. */
export function validate(draft: OpportunityDraft): DraftProblem[] {
  const problems: DraftProblem[] = [];
  if (!draft.type) problems.push({ field: 'type', message: 'Pick what you are offering' });
  if (draft.title.trim().length === 0) {
    problems.push({ field: 'title', message: 'Give it a name students would recognise' });
  }
  if (draft.minimumAge === null) problems.push({ field: 'minimumAge', message: 'Set a minimum age' });
  if (draft.experience === null) {
    problems.push({ field: 'experience', message: 'Say whether experience is needed' });
  }
  if (draft.timing.length === 0) {
    problems.push({ field: 'timing', message: 'Say when you need help' });
  }
  if (draft.compensation === null) {
    problems.push({
      field: 'compensation',
      message:
        draft.type === 'volunteer' ? 'Say the typical commitment' : 'Say what it pays',
    });
  }
  return problems;
}

export function isComplete(draft: OpportunityDraft): boolean {
  return validate(draft).length === 0;
}

/* A posting from an organization we have already checked goes live. One from
   an organization still in review waits with it — a posting can never be more
   trusted than the organization behind it. */
export function statusFor(verification: VerificationStatus): OpportunityStatus {
  return verification === 'VERIFIED' ? 'PUBLISHED' : 'PENDING_REVIEW';
}

export function draftToOpportunity(
  draft: OpportunityDraft,
  organizationId: string,
  verification: VerificationStatus,
  now = new Date(),
): Opportunity | null {
  if (!isComplete(draft) || !draft.type || !draft.minimumAge || !draft.experience) return null;
  if (!draft.compensation) return null;

  const summary = draft.summary.trim();

  return {
    id: `opp-${now.getTime().toString(36)}`,
    organizationId,
    title: draft.title.trim(),
    type: draft.type,
    status: statusFor(verification),
    minimumAge: draft.minimumAge,
    experience: draft.experience,
    timing: draft.timing,
    hours: draft.hours ?? undefined,
    compensation: draft.compensation,
    summary,
    reassurance: summary || reassuranceFor(draft.experience),
    responsibilities: summary ? [summary] : [],
    schedule: '',
    goodToKnow: [],
    interests: [],
    publishedAt: now.toISOString(),
  };
}

function reassuranceFor(experience: Experience): string {
  return experience === 'none'
    ? 'No experience needed — training provided.'
    : 'Some experience helps, but they will show you the rest.';
}

/* Turns the form's loose strings into the one compensation shape its type
   allows, so a volunteer posting can never carry an hourly rate. */
export function compensationFrom(input: {
  type: OpportunityType | null;
  payMin: string;
  payMax: string;
  internshipPay: 'paid' | 'stipend' | 'unpaid' | null;
  stipend: string;
  commitment: VolunteerCommitment | null;
}): Compensation | null {
  if (input.type === 'volunteer') {
    return input.commitment ? { kind: 'commitment', commitment: input.commitment } : null;
  }

  if (input.type === 'internship') {
    if (input.internshipPay === 'unpaid') return { kind: 'unpaid' };
    if (input.internshipPay === 'stipend') {
      const amount = Number(input.stipend);
      return amount > 0 ? { kind: 'stipend', amount, per: 'total' } : null;
    }
    if (input.internshipPay === null) return null;
  }

  const min = Number(input.payMin);
  if (!(min > 0)) return null;
  const max = Number(input.payMax);
  return max > min ? { kind: 'hourly', min, max } : { kind: 'hourly', min };
}
