import { NextResponse } from 'next/server';
import { unsubscribe } from '@/lib/server/unsubscribe';

export const dynamic = 'force-dynamic';

/* The mailbox provider's half of one-click unsubscribe. Gmail and Yahoo POST
   to the List-Unsubscribe URL themselves when someone presses the button in
   their mail client, and expect a 2xx. No page, no session, no confirmation
   step — a confirmation step is exactly what one-click means to skip. */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get('u');
  const token = url.searchParams.get('t');
  if (!userId || !token) return NextResponse.json({ ok: false }, { status: 400 });

  const done = await unsubscribe(userId, token);
  return NextResponse.json({ ok: done }, { status: done ? 200 : 400 });
}
