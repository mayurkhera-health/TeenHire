import { NextResponse } from 'next/server';
import { adminOr404 } from '@/lib/server/adminGuard';
import { record } from '@/lib/server/events';
import { createOpportunity } from '@/lib/server/organizations';
import { draftToOpportunity, type OpportunityDraft } from '@/lib/opportunityDraft';
import { query } from '@/lib/db';
import type { VerificationStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const gate = await adminOr404();
  if ('response' in gate) return gate.response;

  const status = new URL(request.url).searchParams.get('status');
  const rows = await query<{
    id: string; title: string; type: string; status: string; creation_method: string;
    org_name: string; interested: string; published_at: Date;
  }>(
    `SELECT o.id, o.title, o.type, o.status, o.creation_method, org.name AS org_name,
            o.published_at,
            (SELECT count(*) FROM applications a
             WHERE a.opportunity_id = o.id AND a.status <> 'WITHDRAWN')::text AS interested
     FROM opportunities o JOIN organizations org ON org.id = o.organization_id
     ${status ? 'WHERE o.status = $1' : ''}
     ORDER BY o.published_at DESC LIMIT 200`,
    status ? [status] : [],
  );

  return NextResponse.json({
    opportunities: rows.map((r) => ({
      id: r.id, title: r.title, type: r.type, status: r.status,
      creationMethod: r.creation_method, organization: r.org_name,
      interested: Number(r.interested), publishedAt: new Date(r.published_at).toISOString(),
    })),
  });
}

/* §36 — admin-assisted opportunity creation. Deliberately the same draft type
   and the same converter the employer wizard uses: an assisted posting and a
   self-service one differ by one column, never by a code path. That is what
   stops a second opportunity model growing behind this. */
export async function POST(request: Request) {
  const gate = await adminOr404();
  if ('response' in gate) return gate.response;

  const body = (await request.json().catch(() => null)) as
    | { organizationId?: string; draft?: OpportunityDraft; internalNotes?: string }
    | null;
  if (!body?.organizationId || !body?.draft) {
    return NextResponse.json({ error: 'An organization and a draft are required' }, { status: 400 });
  }

  const [org] = await query<{ verification_status: VerificationStatus; kind: string }>(
    'SELECT verification_status, kind FROM organizations WHERE id = $1',
    [body.organizationId],
  );
  if (!org) return NextResponse.json({ error: 'Unknown organization' }, { status: 404 });

  /* §51 holds for admins too. The override the spec allows is to change the
     organization's kind on the record, which is auditable — not to quietly
     post volunteer work on behalf of a business. */
  if (body.draft.type === 'volunteer' && org.kind === 'business') {
    return NextResponse.json(
      { error: 'Volunteer postings need a nonprofit or community organization' },
      { status: 403 },
    );
  }

  const built = draftToOpportunity(body.draft, body.organizationId, org.verification_status);
  if (!built) return NextResponse.json({ error: 'That draft is not complete' }, { status: 400 });

  const { id, status } = await createOpportunity(built, {
    organizationId: body.organizationId,
    createdByUserId: gate.admin.id,
    creationMethod: 'ADMIN_ASSISTED',
    internalNotes: body.internalNotes ?? null,
  });

  await record('OPPORTUNITY_CREATED', {
    userId: gate.admin.id,
    organizationId: body.organizationId,
    opportunityId: id,
    props: { method: 'ADMIN_ASSISTED', status },
  });
  if (status === 'PUBLISHED') {
    await record('OPPORTUNITY_PUBLISHED', { organizationId: body.organizationId, opportunityId: id });
  }

  return NextResponse.json({ id, status });
}
