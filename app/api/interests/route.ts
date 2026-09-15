import { NextResponse } from 'next/server';
import { createInterest, loadApplications, withdrawInterest } from '@/lib/server/applications';
import { record } from '@/lib/server/events';
import { currentUser } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

const NOTE_LIMIT = 250;

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ applications: [] });
  return NextResponse.json({ applications: await loadApplications(user.id) });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { opportunityId?: string; note?: string }
    | null;
  if (!body?.opportunityId) {
    return NextResponse.json({ error: 'An opportunity is required' }, { status: 400 });
  }

  const note = body.note?.trim().slice(0, NOTE_LIMIT) || null;
  const result = await createInterest(user.id, body.opportunityId, note);
  if (!result.ok) return NextResponse.json(result, { status: 409 });

  if (!result.alreadySent) {
    await record('INTEREST_SUBMITTED', {
      userId: user.id,
      opportunityId: body.opportunityId,
      props: { hasNote: note !== null },
    });
  }
  return NextResponse.json(result);
}

export async function DELETE(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { opportunityId?: string } | null;
  if (!body?.opportunityId) {
    return NextResponse.json({ error: 'An opportunity is required' }, { status: 400 });
  }

  await withdrawInterest(user.id, body.opportunityId);
  await record('INTEREST_WITHDRAWN', { userId: user.id, opportunityId: body.opportunityId });
  return NextResponse.json({ ok: true });
}
