import { NextResponse } from 'next/server';
import { requestCode } from '@/lib/server/auth';
import type { ContactMethod } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { method?: ContactMethod; contact?: string }
    | null;

  if (!body?.method || !body?.contact || !['email', 'phone'].includes(body.method)) {
    return NextResponse.json({ error: 'A contact method and address are required' }, { status: 400 });
  }

  const result = await requestCode(body.method, body.contact);
  if (!result.ok) {
    /* 429 for the cooldown so a client can tell "slow down" from "that is not
       a valid address", which are very different things to show a student. */
    const status = result.retryAfterSeconds ? 429 : 400;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
