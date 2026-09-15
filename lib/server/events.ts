import { query } from '../db';

/* The event log.
 *
 * §61 says the first release exists to prove supply, demand, liquidity and
 * employer value. Those are not things you bolt on at the end — they are what
 * every phase is supposed to be producing evidence for, so instrumentation
 * ships alongside each feature rather than after all of them.
 *
 * Kept in our own Postgres rather than sent to a third party: it is less code
 * than an SDK, the same rows answer the marketplace-health questions and the
 * admin audit requirement, and behavioural data about minors stays on
 * infrastructure we control. */

export type EventName =
  /* Student funnel (§47) */
  | 'STUDENT_SIGNUP'
  | 'STUDENT_SIGNIN'
  | 'ONBOARDING_COMPLETE'
  | 'OPPORTUNITY_VIEW'
  | 'OPPORTUNITY_SAVE'
  | 'OPPORTUNITY_UNSAVE'
  | 'INTEREST_STARTED'
  | 'INTEREST_SUBMITTED'
  | 'INTEREST_WITHDRAWN'
  /* Employer funnel (§48) */
  | 'ORGANIZATION_CREATED'
  | 'ORGANIZATION_VERIFIED'
  | 'OPPORTUNITY_CREATED'
  | 'OPPORTUNITY_PUBLISHED'
  | 'INTEREST_VIEWED'
  | 'EMPLOYER_RESPONDED';

export interface EventContext {
  userId?: string | null;
  organizationId?: string | null;
  opportunityId?: string | null;
  props?: Record<string, unknown>;
}

/* Never throws. An analytics write that takes down an expression of interest
   would be a worse bug than the missing row it was trying to record. */
export async function record(name: EventName, context: EventContext = {}): Promise<void> {
  try {
    await query(
      `INSERT INTO events (name, user_id, organization_id, opportunity_id, props)
       VALUES ($1,$2,$3,$4,$5)`,
      [
        name,
        context.userId ?? null,
        context.organizationId ?? null,
        context.opportunityId ?? null,
        JSON.stringify(context.props ?? {}),
      ],
    );
  } catch (error) {
    console.error('[events] failed to record', name, error);
  }
}
