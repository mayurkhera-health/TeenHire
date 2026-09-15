import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/server/session';
import { loadStudent } from '@/lib/server/students';

export const dynamic = 'force-dynamic';

/* Who am I, and what does the server know about me. The client holds no
   authority over either — it asks. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ user: null, profile: null });

  return NextResponse.json({
    user: { id: user.id, contact: user.contact, method: user.contactMethod, role: user.role },
    profile: await loadStudent(user.id),
  });
}
