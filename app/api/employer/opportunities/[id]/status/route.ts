import { NextResponse } from 'next/server';
import { employerFor } from '@/lib/server/employerGuard';
import { record } from '@/lib/server/events';
import { setEmployerStatus, type EmployerStatus } from '@/lib/server/organizations';

export const dynamic = 'force-dynamic';

/* The three states an employer controls. Everything else — draft, in review,
   rejected, expired — belongs to us or to the clock, and an employer moving a
   posting into one of those would either bypass review or fake a decision
   that was never made. */
const ALLOWED: EmployerStatus[] = ['PUBLISHED', 'PAUSED', 'FILLED'];

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await employerFor(id);
  if ('error' in g) return g.error;

  const body = (await request.json().catch(() => null)) as { status?: string } | null;
  const status = ALLOWED.find((s) => s === body?.status);
  if (!status) return NextResponse.json({ error: 'That is not a state you can set' }, { status: 400 });

  const result = await setEmployerStatus(g.org.id, id, status);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });

  /* Deliberately not OPPORTUNITY_PUBLISHED. That event means a posting
     reached students for the first time, and counting a republish as one
     would inflate supply — putting a paused posting back up is the same
     posting. The status event already carries the fact. */
  await record('OPPORTUNITY_STATUS_CHANGED', {
    userId: g.user.id,
    organizationId: g.org.id,
    opportunityId: id,
    props: { status, by: 'EMPLOYER' },
  });

  return NextResponse.json({ ok: true, status });
}
