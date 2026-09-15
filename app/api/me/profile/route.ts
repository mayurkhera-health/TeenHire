import { NextResponse } from 'next/server';
import { record } from '@/lib/server/events';
import { loadStudent, saveStudent } from '@/lib/server/students';
import { currentUser } from '@/lib/server/session';
import type { StudentProfile } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function PUT(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { profile?: StudentProfile } | null;
  const profile = body?.profile;

  if (
    !profile ||
    typeof profile.age !== 'number' ||
    typeof profile.radiusMiles !== 'number' ||
    typeof profile.searchLocation?.lat !== 'number' ||
    typeof profile.searchLocation?.lng !== 'number'
  ) {
    return NextResponse.json({ error: 'A complete profile is required' }, { status: 400 });
  }

  const existing = await loadStudent(user.id);
  await saveStudent(user.id, profile);
  if (!existing) await record('ONBOARDING_COMPLETE', { userId: user.id });

  return NextResponse.json({ ok: true, profile: await loadStudent(user.id) });
}
