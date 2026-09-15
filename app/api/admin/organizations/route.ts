import { NextResponse } from 'next/server';
import { listOrganizations } from '@/lib/server/admin';
import { adminOr404 } from '@/lib/server/adminGuard';
import { record } from '@/lib/server/events';
import { createOrganization } from '@/lib/server/organizations';
import type { OrganizationKind, VerificationStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const gate = await adminOr404();
  if ('response' in gate) return gate.response;

  const status = new URL(request.url).searchParams.get('status') as VerificationStatus | null;
  return NextResponse.json({ organizations: await listOrganizations(status ?? undefined) });
}

/* §35 — admin-assisted organization creation, the cold-start tool.
   Creates a record with no account attached: an organization and an
   organization login are separate things, and this is the case that proves
   it. Claiming comes later and is explicitly out of scope (§56). */
export async function POST(request: Request) {
  const gate = await adminOr404();
  if ('response' in gate) return gate.response;

  const body = (await request.json().catch(() => null)) as {
    name?: string; kind?: OrganizationKind; website?: string; phone?: string;
    contactName?: string; city?: string; zip?: string; about?: string;
    verified?: boolean;
  } | null;

  if (!body?.name?.trim() || !body?.city?.trim() || !/^\d{5}$/.test(body?.zip ?? '') ||
      (body.kind !== 'business' && body.kind !== 'nonprofit')) {
    return NextResponse.json({ error: 'Name, kind, city and ZIP are required' }, { status: 400 });
  }

  const organizationId = await createOrganization(
    {
      name: body.name.trim(), kind: body.kind, website: body.website?.trim(),
      phone: body.phone?.trim(), contactName: body.contactName?.trim() ?? '',
      city: body.city.trim(), zip: body.zip as string, about: body.about?.trim(),
    },
    null,
  );

  await record('ORGANIZATION_CREATED', {
    userId: gate.admin.id,
    organizationId,
    props: { kind: body.kind, method: 'ADMIN_ASSISTED' },
  });

  return NextResponse.json({ id: organizationId });
}
