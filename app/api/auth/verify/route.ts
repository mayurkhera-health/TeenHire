import { NextResponse } from 'next/server';
import { verifyCode } from '@/lib/server/auth';
import { setSessionCookie } from '@/lib/server/session';
import { record } from '@/lib/server/events';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { challengeId?: string; code?: string }
    | null;

  if (!body?.challengeId || !body?.code) {
    return NextResponse.json({ error: 'A challenge and a code are required' }, { status: 400 });
  }

  const result = await verifyCode(body.challengeId, body.code);
  if (!result.ok) {
    return NextResponse.json(result, { status: 401 });
  }

  await setSessionCookie(result.token);
  await record(result.isNew ? 'STUDENT_SIGNUP' : 'STUDENT_SIGNIN', { userId: result.userId });

  /* The token is in an httpOnly cookie and deliberately not in this body. */
  return NextResponse.json({ ok: true, isNew: result.isNew });
}
