import { NextResponse } from 'next/server';
import { record } from '@/lib/server/events';
import { loadSaved, toggleSaved } from '@/lib/server/students';
import { currentUser } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ saved: [] });
  return NextResponse.json({ saved: await loadSaved(user.id) });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { opportunityId?: string } | null;
  if (!body?.opportunityId) {
    return NextResponse.json({ error: 'An opportunity is required' }, { status: 400 });
  }

  const nowSaved = await toggleSaved(user.id, body.opportunityId);
  /* §21 wants saves as an early demand signal, which needs the event as much
     as the row. */
  await record(nowSaved ? 'OPPORTUNITY_SAVE' : 'OPPORTUNITY_UNSAVE', {
    userId: user.id,
    opportunityId: body.opportunityId,
  });
  return NextResponse.json({ saved: nowSaved });
}
