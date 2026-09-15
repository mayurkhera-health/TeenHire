import { NextResponse } from 'next/server';
import { setOpportunityStatus } from '@/lib/server/admin';
import { adminOr404 } from '@/lib/server/adminGuard';

export const dynamic = 'force-dynamic';

const ALLOWED = ['PUBLISHED', 'PAUSED', 'FILLED', 'EXPIRED', 'REJECTED'] as const;

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await adminOr404();
  if ('response' in gate) return gate.response;

  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as
    | { status?: (typeof ALLOWED)[number] }
    | null;

  if (!body?.status || !ALLOWED.includes(body.status)) {
    return NextResponse.json({ error: 'A valid status is required' }, { status: 400 });
  }

  const updated = await setOpportunityStatus(gate.admin, id, body.status);
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true, status: body.status });
}
