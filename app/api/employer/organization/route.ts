import { NextResponse } from 'next/server';
import { record } from '@/lib/server/events';
import { createOrganization, organizationForUser } from '@/lib/server/organizations';
import { currentUser } from '@/lib/server/session';
import type { OrganizationKind } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ organization: null });
  return NextResponse.json({ organization: await organizationForUser(user.id) });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });

  const existing = await organizationForUser(user.id);
  if (existing) return NextResponse.json({ organization: existing });

  const body = (await request.json().catch(() => null)) as {
    name?: string;
    kind?: OrganizationKind;
    website?: string;
    phone?: string;
    contactName?: string;
    city?: string;
    zip?: string;
  } | null;

  if (
    !body?.name?.trim() ||
    !body?.contactName?.trim() ||
    !body?.city?.trim() ||
    !/^\d{5}$/.test(body?.zip ?? '') ||
    (body.kind !== 'business' && body.kind !== 'nonprofit')
  ) {
    return NextResponse.json({ error: 'Organization name, contact, city and ZIP are required' }, { status: 400 });
  }

  const organizationId = await createOrganization(
    {
      name: body.name.trim(),
      kind: body.kind,
      website: body.website?.trim(),
      phone: body.phone?.trim(),
      contactName: body.contactName.trim(),
      city: body.city.trim(),
      zip: body.zip as string,
    },
    user.id,
  );

  await record('ORGANIZATION_CREATED', {
    userId: user.id,
    organizationId,
    props: { kind: body.kind, method: 'EMPLOYER_SELF_SERVICE' },
  });

  return NextResponse.json({ organization: await organizationForUser(user.id) });
}
