import { NextResponse } from 'next/server';
import { setVerification } from '@/lib/server/admin';
import { adminOr404 } from '@/lib/server/adminGuard';
import type { VerificationStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

const ALLOWED: VerificationStatus[] = ['PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED'];

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await adminOr404();
  if ('response' in gate) return gate.response;

  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as
    | { status?: VerificationStatus; note?: string }
    | null;

  if (!body?.status || !ALLOWED.includes(body.status)) {
    return NextResponse.json({ error: 'A valid status is required' }, { status: 400 });
  }

  /* Rejecting or suspending needs a reason. Approving does not — the evidence
     an admin checked is the organization record itself. */
  if ((body.status === 'REJECTED' || body.status === 'SUSPENDED') && !body.note?.trim()) {
    return NextResponse.json({ error: 'Say why, for the record' }, { status: 400 });
  }

  const result = await setVerification(gate.admin, id, body.status, body.note?.trim() ?? null);
  return NextResponse.json({ ok: true, ...result });
}
