import { NextResponse } from 'next/server';
import { preferencesFor, savePreferences } from '@/lib/server/audience';
import { currentUser } from '@/lib/server/session';
import type { NotificationPreferences, OpportunityType } from '@/lib/types';

export const dynamic = 'force-dynamic';

const TYPES: OpportunityType[] = ['paid', 'internship', 'volunteer'];
const FREQUENCIES: NotificationPreferences['frequency'][] = [
  'immediately',
  'daily',
  'weekly',
  'off',
];

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ preferences: null });
  return NextResponse.json({ preferences: await preferencesFor(user.id) });
}

/* These are the settings the sender reads. Validated rather than trusted:
   an unrecognised frequency that fell through would be neither "off" nor a
   real schedule, and the safest thing a bad value can do is be refused. */
export async function PUT(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { preferences?: { types?: unknown; frequency?: unknown } }
    | null;

  const frequency = FREQUENCIES.find((f) => f === body?.preferences?.frequency);
  if (!frequency) return NextResponse.json({ error: 'Unknown frequency' }, { status: 400 });

  const raw = body?.preferences?.types;
  const types = Array.isArray(raw) ? TYPES.filter((t) => raw.includes(t)) : [];

  const saved = await savePreferences(user.id, { types, frequency });
  if (!saved) {
    /* No student row yet: there is nothing to attach a preference to, and
       inventing one here would create a profile the student never filled in. */
    return NextResponse.json({ error: 'Finish setting up your profile first' }, { status: 409 });
  }

  return NextResponse.json({ ok: true, preferences: { types, frequency } });
}
