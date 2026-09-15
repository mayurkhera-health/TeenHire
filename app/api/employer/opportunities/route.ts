import { NextResponse } from 'next/server';
import { record } from '@/lib/server/events';
import { onOpportunityPublished } from '@/lib/server/triggers';
import { createOpportunity, listPostings, organizationForUser } from '@/lib/server/organizations';
import { currentUser } from '@/lib/server/session';
import { draftToOpportunity, type OpportunityDraft } from '@/lib/opportunityDraft';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ postings: [] });
  const org = await organizationForUser(user.id);
  if (!org) return NextResponse.json({ postings: [] });
  return NextResponse.json({ organization: org, postings: await listPostings(org.id) });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });

  const org = await organizationForUser(user.id);
  if (!org) return NextResponse.json({ error: 'Create your organization first' }, { status: 409 });

  /* §51: a business cannot classify unpaid work as volunteering. Enforced on
     the server, where a modified request cannot get around it. */
  const body = (await request.json().catch(() => null)) as { draft?: OpportunityDraft } | null;
  const draft = body?.draft;
  if (!draft) return NextResponse.json({ error: 'A draft is required' }, { status: 400 });
  if (draft.type === 'volunteer' && org.kind === 'business') {
    return NextResponse.json(
      { error: 'Volunteer postings are for nonprofit and community organizations' },
      { status: 403 },
    );
  }

  /* The same draft the employer wizard builds, through the same converter an
     admin-assisted posting will use. */
  const built = draftToOpportunity(draft, org.id, org.verificationStatus);
  if (!built) return NextResponse.json({ error: 'That draft is not complete' }, { status: 400 });

  const { id, status } = await createOpportunity(built, {
    organizationId: org.id,
    createdByUserId: user.id,
    creationMethod: 'EMPLOYER_SELF_SERVICE',
  });

  await record('OPPORTUNITY_CREATED', {
    userId: user.id,
    organizationId: org.id,
    opportunityId: id,
    props: { method: 'EMPLOYER_SELF_SERVICE', status },
  });
  if (status === 'PUBLISHED') {
    await record('OPPORTUNITY_PUBLISHED', { organizationId: org.id, opportunityId: id });
    await onOpportunityPublished(id);
  }

  return NextResponse.json({ id, status });
}
