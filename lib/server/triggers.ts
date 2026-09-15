import { query } from '../db';
import { applicationEvent } from '../notifications';
import { audienceFor } from './audience';
import { queueNotification } from './notify';

/* Where notifications are raised.
 *
 * Kept in one file rather than sprinkled through the routes, so the question
 * "what makes this product message somebody?" has one answer that can be read
 * top to bottom. Every function here is best-effort: a notification that
 * cannot be composed must never fail the thing that caused it. A student's
 * expression of interest is recorded whether or not the email goes out.
 *
 * Nothing here sends. Each function writes rows into the delivery log and
 * returns; the worker does the sending. That is what keeps a slow provider
 * from making the interest button feel broken. */

async function safely(what: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (cause) {
    console.error(`[notify] ${what} failed:`, cause);
  }
}

/* §19. Everyone eligible who asked to hear about this kind of work.
   The dedupe key is per student per posting, so republishing a paused posting
   does not notify the same people a second time — they were already told this
   exists, and a second identical message reads as a bug. */
export async function onOpportunityPublished(opportunityId: string): Promise<number> {
  let queued = 0;
  await safely(`publish ${opportunityId}`, async () => {
    for (const { userId, notification } of await audienceFor(opportunityId)) {
      const outcome = await queueNotification({
        userId,
        notification,
        dedupeKey: `NEW_MATCH:${opportunityId}:${userId}`,
      });
      if (outcome.queued) queued += 1;
    }
  });
  return queued;
}

/* The posting and organization behind an application, which is all the
   application-side messages name. Deliberately not the student: these
   messages are sent to the student, so describing them back to themselves
   would be noise, and describing them to anyone else is forbidden. */
interface Subject {
  studentUserId: string;
  opportunity: { id: string; title: string };
  organization: { name: string };
}

async function subjectFor(applicationId: string): Promise<Subject | null> {
  const [row] = await query<{
    student_user_id: string;
    opportunity_id: string;
    title: string;
    org_name: string;
  }>(
    `SELECT a.student_user_id, o.id AS opportunity_id, o.title, org.name AS org_name
     FROM applications a
     JOIN opportunities o ON o.id = a.opportunity_id
     JOIN organizations org ON org.id = o.organization_id
     WHERE a.id = $1`,
    [applicationId],
  );
  if (!row) return null;
  return {
    studentUserId: row.student_user_id,
    opportunity: { id: row.opportunity_id, title: row.title },
    organization: { name: row.org_name },
  };
}

export async function onInterestSubmitted(applicationId: string): Promise<void> {
  await safely(`interest ${applicationId}`, async () => {
    const subject = await subjectFor(applicationId);
    if (!subject) return;
    await queueNotification({
      userId: subject.studentUserId,
      notification: applicationEvent('APPLICATION_SUBMITTED', subject),
      dedupeKey: `APPLICATION_SUBMITTED:${applicationId}`,
    });
  });
}

/* Once per posting per student, not once per time an employer opens the
   screen. Somebody refreshing their applicant list must not buzz a teenager's
   phone repeatedly, which is exactly what an un-keyed trigger would do. */
export async function onApplicationsViewed(opportunityId: string): Promise<void> {
  await safely(`viewed ${opportunityId}`, async () => {
    const rows = await query<{ id: string }>(
      `SELECT id FROM applications
       WHERE opportunity_id = $1 AND status <> 'WITHDRAWN'`,
      [opportunityId],
    );
    for (const row of rows) {
      const subject = await subjectFor(row.id);
      if (!subject) continue;
      await queueNotification({
        userId: subject.studentUserId,
        notification: applicationEvent('APPLICATION_VIEWED', subject),
        dedupeKey: `APPLICATION_VIEWED:${row.id}`,
      });
    }
  });
}

/* The one message in the product that is genuinely good news, and the only
   one where a student is waiting for it. "Not selected" deliberately raises
   nothing: a rejection push notification is not a feature. */
export async function onEmployerInterested(applicationId: string): Promise<void> {
  await safely(`employer response ${applicationId}`, async () => {
    const subject = await subjectFor(applicationId);
    if (!subject) return;
    await queueNotification({
      userId: subject.studentUserId,
      notification: applicationEvent('EMPLOYER_INTERESTED', subject),
      dedupeKey: `EMPLOYER_INTERESTED:${applicationId}`,
    });
  });
}
