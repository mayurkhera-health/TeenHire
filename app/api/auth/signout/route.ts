import { NextResponse } from 'next/server';
import { revokeSession } from '@/lib/server/auth';
import { clearSessionCookie, currentToken } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

export async function POST() {
  await revokeSession(await currentToken());
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
