import { NextResponse } from 'next/server';
import {
  loadInterestedStudents,
  markViewed,
  respondToApplicant,
} from '@/lib/server/applications';
import { record } from '@/lib/server/events';
import { organizationForUser, ownsOpportunity } from '@/lib/server/organizations';
import { currentUser } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

/* An organization sees students only for its own postings, and only the
   columns §33 allows. Both facts are enforced here rather than in the screen. */
async function guard(opportunityId: string) {
  const user = await currentUser();
  if (!user) return { error: NextResponse.json({ error: 'Sign in first' }, { status: 401 }) };
  const org = await organizationForUser(user.id);
  if (!org) return { error: NextResponse.json({ error: 'No organization' }, { status: 403 }) };
  if (!(await ownsOpportunity(org.id, opportunityId))) {
    /* 404 rather than 403: a wrong guess should not confirm that a posting
       exists. */
    return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  }
  return { user, org };
}

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await guard(id);
  if ('error' in g) return g.error;

  const students = await loadInterestedStudents(id);
  if (students.length > 0) {
    await markViewed(id);
    await record('INTEREST_VIEWED', {
      userId: g.user.id,
      organizationId: g.org.id,
      opportunityId: id,
      props: { count: students.length },
    });
  }
  return NextResponse.json({ students });
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await guard(id);
  if ('error' in g) return g.error;

  const body = (await request.json().catch(() => null)) as
    | { applicationId?: string; decision?: 'interested' | 'not_a_match' }
    | null;
  if (!body?.applicationId || !body?.decision) {
    return NextResponse.json({ error: 'An application and a decision are required' }, { status: 400 });
  }

  const status = body.decision === 'interested' ? 'EMPLOYER_INTERESTED' : 'NOT_SELECTED';
  const updated = await respondToApplicant(body.applicationId, g.org.id, status);
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await record('EMPLOYER_RESPONDED', {
    userId: g.user.id,
    organizationId: g.org.id,
    opportunityId: id,
    props: { decision: status },
  });
  return NextResponse.json({ ok: true, status });
}
