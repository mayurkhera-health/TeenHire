import { NextResponse } from 'next/server';
import { requireAdmin } from './admin';
import type { SessionUser } from './auth';

/* Every admin endpoint goes through this. A 404 rather than a 403 for a
   non-admin: the existence of the console is not something a signed-in
   student needs confirmed. */
export async function adminOr404(): Promise<
  { admin: SessionUser } | { response: NextResponse }
> {
  const admin = await requireAdmin();
  if (!admin) return { response: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  return { admin };
}
