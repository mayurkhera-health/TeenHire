import { NextResponse } from 'next/server';
import { evaluateFit, rank, type Ranked } from '@/lib/matching';
import { countBeyond, findEligible, findManyByIds } from '@/lib/repository';
import { record } from '@/lib/server/events';
import { currentUser } from '@/lib/server/session';
import type { StudentProfile } from '@/lib/types';

/* One endpoint for opportunity data, so there is never a second source for a
   screen to drift from.
 *
 * With `ids` it returns exactly those, whatever their eligibility — Saved,
 * Activity and a shared detail link all have to show something a student may
 * no longer qualify for. Without `ids` it returns the eligible feed.
 *
 * POST rather than GET, and not out of REST indifference: the request carries
 * the student's search coordinates, and §36 treats those as something to keep
 * close. Query strings end up in access logs, browser history and referrer
 * headers; a body does not. */

export const dynamic = 'force-dynamic';

interface OpportunitiesRequest {
  profile?: StudentProfile | null;
  ids?: string[];
  beyondRadius?: number;
}

export async function POST(request: Request) {
  let body: OpportunitiesRequest;
  try {
    body = (await request.json()) as OpportunitiesRequest;
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }

  const profile = body.profile;
  const location = profile?.searchLocation;

  /* A shared link, opened by somebody who has no profile on this device.
   *
   * They get the facts that are true of the posting whatever anyone's age or
   * address is — and no fit, because there is nobody to fit it to. Deliberately
   * not a redirect to onboarding: asking five questions before showing the
   * thing a friend sent them is how a shared link stops being worth sending.
   *
   * Only ever by id. Without one this stays the eligible feed, which needs a
   * profile, so there is no way to enumerate the marketplace from here. */
  if (!profile && body.ids && body.ids.length > 0) {
    const rows = await findManyByIds(body.ids.slice(0, 20), null);
    return NextResponse.json({
      items: rows.map(({ opportunity, organization }) => ({ opportunity, organization })),
      beyond: 0,
      public: true,
    });
  }

  if (
    !profile ||
    typeof profile.age !== 'number' ||
    typeof profile.radiusMiles !== 'number' ||
    !location ||
    typeof location.lat !== 'number' ||
    typeof location.lng !== 'number'
  ) {
    return NextResponse.json(
      { error: 'A profile with an age and a location is required' },
      { status: 400 },
    );
  }

  const from = { lat: location.lat, lng: location.lng };

  try {
    const rows = body.ids
      ? await findManyByIds(body.ids, from)
      : await findEligible({
          age: profile.age,
          lat: from.lat,
          lng: from.lng,
          radiusMiles: profile.radiusMiles,
        });

    /* Distance comes from PostGIS rather than being recomputed here, so the
       number a student reads is the number the query filtered on. */
    const ranked: Ranked[] = rows.map(({ opportunity, organization, distanceMiles }) => {
      const fit = evaluateFit(opportunity, organization, profile);
      /* Non-null on this path: every branch above it required a profile, and
         a profile is what gives PostGIS somewhere to measure from. */
      return { opportunity, organization, fit: { ...fit, distance: distanceMiles ?? 0 } };
    });

    if (!body.ids) {
      const now = new Date();
      ranked.sort((a, b) => rank(a, b, profile, now));
    }

    /* A request for exactly one opportunity is a student opening its detail
       screen. §47's funnel needs that step, and the interest rate is
       meaningless without it. Recorded here rather than from the client so it
       cannot be lost to an ad blocker. */
    if (body.ids?.length === 1 && rows.length === 1) {
      const viewer = await currentUser();
      if (viewer) {
        await record('OPPORTUNITY_VIEW', {
          userId: viewer.id,
          opportunityId: body.ids[0],
        });
      }
    }

    const beyond =
      typeof body.beyondRadius === 'number'
        ? await countBeyond(
            { age: profile.age, lat: from.lat, lng: from.lng, radiusMiles: profile.radiusMiles },
            body.beyondRadius,
          )
        : 0;

    return NextResponse.json({ items: ranked, beyond });
  } catch (error) {
    /* A database that is unreachable must look like a failure, never like an
       empty neighbourhood — "nothing near you" is a sentence this product is
       only allowed to say when it is true. */
    console.error('opportunity query failed', error);
    return NextResponse.json(
      { error: 'Could not reach the opportunity database' },
      { status: 503 },
    );
  }
}
