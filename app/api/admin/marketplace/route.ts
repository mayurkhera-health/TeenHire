import { NextResponse } from 'next/server';
import { marketplace, recentAudit } from '@/lib/server/admin';
import { adminOr404 } from '@/lib/server/adminGuard';

export const dynamic = 'force-dynamic';

export async function GET() {
  const gate = await adminOr404();
  if ('response' in gate) return gate.response;
  return NextResponse.json({ marketplace: await marketplace(), audit: await recentAudit() });
}
