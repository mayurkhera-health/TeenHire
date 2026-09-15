import { NextResponse } from 'next/server';
import { organizationForUser, ownsOpportunity, type OrgSummary } from './organizations';
import type { SessionUser } from './auth';
import { currentUser } from './session';

/* One guard, used by every employer route that names a posting id.
 *
 * It exists because the alternative — each route remembering to check
 * ownership — is a rule that holds only until somebody adds the next route.
 * The guard resolves the caller's organization and refuses anything that is
 * not theirs, and the queries behind it put organization_id in the WHERE
 * clause as well, so a route that somehow skipped this still could not reach
 * another employer's row. */

export type EmployerContext =
  | { error: NextResponse }
  | { user: SessionUser; org: OrgSummary };

export async function employerFor(opportunityId?: string): Promise<EmployerContext> {
  const user = await currentUser();
  if (!user) return { error: NextResponse.json({ error: 'Sign in first' }, { status: 401 }) };

  const org = await organizationForUser(user.id);
  if (!org) return { error: NextResponse.json({ error: 'No organization' }, { status: 403 }) };

  if (opportunityId && !(await ownsOpportunity(org.id, opportunityId))) {
    /* 404 rather than 403. A wrong guess should not confirm that a posting
       exists, let alone which organization it belongs to. */
    return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  }

  return { user, org };
}
