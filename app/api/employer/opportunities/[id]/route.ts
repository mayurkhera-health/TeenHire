import { NextResponse } from 'next/server';
import { employerFor } from '@/lib/server/employerGuard';
import { record } from '@/lib/server/events';
import { loadPostingForEdit, updatePosting } from '@/lib/server/organizations';
import { compensationFrom, validate, type OpportunityDraft } from '@/lib/opportunityDraft';
import { EMPLOYER_TIMING } from '@/lib/copy';
import type {
  Experience,
  HoursBucket,
  MinimumAge,
  OpportunityType,
  Timing,
  VolunteerCommitment,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await employerFor(id);
  if ('error' in g) return g.error;

  const posting = await loadPostingForEdit(g.org.id, id);
  if (!posting) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ posting, organization: g.org });
}

/* What an edit is allowed to carry.
 *
 * Not a Compensation object: the client sends the same loose pay fields the
 * posting wizard collects and the server runs them through the one converter,
 * so a volunteer posting cannot be edited into carrying an hourly rate by
 * anyone who can shape a request body. Type is absent on purpose — changing
 * it would change which compensation shapes are legal and would step around
 * the rule that a business cannot post volunteer work. */
interface EditBody {
  title?: unknown;
  summary?: unknown;
  minimumAge?: unknown;
  experience?: unknown;
  timing?: unknown;
  hours?: unknown;
  pay?: {
    payMin?: unknown;
    payMax?: unknown;
    internshipPay?: unknown;
    stipend?: unknown;
    commitment?: unknown;
  };
}

const AGES: MinimumAge[] = [15, 16, 17, 18];
const EXPERIENCES: Experience[] = ['none', 'some', 'required'];
const HOURS: HoursBucket[] = ['under_10', '10_20', '20_plus', 'varies'];
const COMMITMENTS: VolunteerCommitment[] = ['one_time', 'weekly', 'monthly', 'flexible'];

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function oneOf<T>(allowed: readonly T[], value: unknown): T | null {
  return allowed.includes(value as T) ? (value as T) : null;
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await employerFor(id);
  if ('error' in g) return g.error;

  const existing = await loadPostingForEdit(g.org.id, id);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = (await request.json().catch(() => null)) as EditBody | null;
  if (!body) return NextResponse.json({ error: 'An edit is required' }, { status: 400 });

  const type = existing.type as OpportunityType;
  const timing = Array.isArray(body.timing)
    ? (body.timing.filter((t) => EMPLOYER_TIMING.includes(t as Timing)) as Timing[])
    : [];

  const compensation = compensationFrom({
    type,
    payMin: str(body.pay?.payMin),
    payMax: str(body.pay?.payMax),
    internshipPay: oneOf(['paid', 'stipend', 'unpaid'] as const, body.pay?.internshipPay),
    stipend: str(body.pay?.stipend),
    commitment: oneOf(COMMITMENTS, body.pay?.commitment),
  });

  /* Validated by the same function the posting wizard uses, so an edit cannot
     leave a posting in a state the wizard would have refused to create. */
  const draft: OpportunityDraft = {
    source: 'form',
    type,
    title: str(body.title),
    summary: str(body.summary),
    minimumAge: oneOf(AGES, body.minimumAge),
    experience: oneOf(EXPERIENCES, body.experience),
    timing,
    hours: oneOf(HOURS, body.hours),
    compensation,
  };

  const problems = validate(draft);
  if (problems.length > 0) {
    return NextResponse.json({ error: problems[0]!.message, problems }, { status: 400 });
  }

  const saved = await updatePosting(g.org.id, id, {
    title: draft.title.trim(),
    summary: draft.summary.trim(),
    minimumAge: draft.minimumAge!,
    experience: draft.experience!,
    timing: draft.timing,
    hours: draft.hours,
    compensation: draft.compensation!,
  });
  if (!saved) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  /* Raising the minimum age is the one edit that silently takes something
     away from students who have already applied. The screen warns before
     saving; the log records it afterwards, because it is also the thing we
     would want to be able to count. */
  const disqualified = existing.interestedAges.filter((age) => age < draft.minimumAge!).length;

  await record('OPPORTUNITY_EDITED', {
    userId: g.user.id,
    organizationId: g.org.id,
    opportunityId: id,
    props: {
      ageRaised: draft.minimumAge! > existing.minimumAge,
      disqualifiedExistingInterest: disqualified,
    },
  });

  return NextResponse.json({ ok: true, disqualified });
}
