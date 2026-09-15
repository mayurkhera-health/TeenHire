import { NextResponse } from 'next/server';
import { DEMAND_MIN_CELL, demandSignals } from '@/lib/server/admin';
import { adminOr404 } from '@/lib/server/adminGuard';

export const dynamic = 'force-dynamic';

export async function GET() {
  const gate = await adminOr404();
  if ('response' in gate) return gate.response;
  const { cells, withheld } = await demandSignals();
  return NextResponse.json({ cells, withheld, minimumCell: DEMAND_MIN_CELL });
}
