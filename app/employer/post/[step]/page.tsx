'use client';

import { notFound, useRouter } from 'next/navigation';
import { use, useMemo } from 'react';
import { BackButton } from '@/components/Shell';
import { Chip, ProgressRail, Tile } from '@/components/ui';
import { OpportunityCard } from '@/components/OpportunityCard';
import { usePostDraft, type PostDraft } from '@/components/PostDraft';
import { EMPLOYER_TIMING, EXPERIENCE_EMPLOYER_LABEL, HOURS_LABEL, TIMING_LABEL } from '@/lib/copy';
import { estimateReach } from '@/lib/data';
import { DEFAULT_LOCATION } from '@/lib/geo';
import { useApp } from '@/lib/store';
import type {
  Compensation,
  Experience,
  HoursBucket,
  MinimumAge,
  Opportunity,
  OpportunityType,
  Organization,
  Timing,
  VolunteerCommitment,
} from '@/lib/types';

/* Posting is a conversation, not a requisition. Five questions, large tap
   targets, and the last one shows the employer the exact card a student
   will see before anything is submitted. */

const TOTAL = 5;

export default function PostStep({ params }: { params: Promise<{ step: string }> }) {
  const { step: raw } = use(params);
  const step = Number(raw);
  if (!Number.isInteger(step) || step < 1 || step > TOTAL) notFound();

  return (
    <div className="screen">
      <main className="page gutter console">
        <div className="row gap-3">
          <BackButton />
          <div style={{ flex: 1 }}>
            <ProgressRail step={step} total={TOTAL} showCount />
          </div>
        </div>
        <Step step={step} />
      </main>
    </div>
  );
}

function Step({ step }: { step: number }) {
  switch (step) {
    case 1:
      return <TypeStep />;
    case 2:
      return <TitleStep />;
    case 3:
      return <WhoStep />;
    case 4:
      return <WhenStep />;
    default:
      return <PayStep />;
  }
}

function useNext(step: number) {
  const router = useRouter();
  return () => router.push(`/employer/post/${step + 1}`);
}

function Header({ question, why }: { question: string; why?: string }) {
  return (
    <div className="question">
      <h1 className="t-display">{question}</h1>
      {why ? <p className="t-meta">{why}</p> : null}
    </div>
  );
}

function Continue({ onClick, disabled, label = 'Continue' }: { onClick: () => void; disabled: boolean; label?: string }) {
  return (
    <div className="sticky-cta">
      <button type="button" className="btn btn-primary btn-block" onClick={onClick} disabled={disabled}>
        {label}
      </button>
    </div>
  );
}

/* ---------- 1 · What are you offering ---------- */

function TypeStep() {
  const { draft, set } = usePostDraft();
  const { employerOrg } = useApp();
  const next = useNext(1);

  /* The volunteer safety rule: a business cannot classify ordinary work as
     volunteering. Nonprofits can; a business that genuinely needs to gets
     there through an admin override, not through this screen. */
  const canPostVolunteer = employerOrg?.kind !== 'business';

  return (
    <>
      <Header question="What are you offering?" />
      <div className="answers">
        <Tile label="Paid job" note="Regular paid work" selected={draft.type === 'paid'} onClick={() => set({ type: 'paid' })} />
        <Tile
          label="Internship"
          note="A structured experience — paid, stipend or unpaid"
          selected={draft.type === 'internship'}
          onClick={() => set({ type: 'internship' })}
        />
        {canPostVolunteer ? (
          <Tile
            label="Volunteer"
            note="Service opportunities"
            selected={draft.type === 'volunteer'}
            onClick={() => set({ type: 'volunteer' })}
          />
        ) : (
          <div className="fit" data-eligible="false">
            <h2 className="fit-heading">Volunteer is for nonprofits</h2>
            <p className="fit-line">
              If your work is genuinely voluntary, write to us and we will review it by hand.
            </p>
          </div>
        )}
      </div>
      <Continue onClick={next} disabled={draft.type === null} />
    </>
  );
}

/* ---------- 2 · What should we call it ---------- */

function TitleStep() {
  const { draft, set } = usePostDraft();
  const next = useNext(2);

  return (
    <>
      <Header question="What should we call it?" why="Plain words beat a job title. Students search for what they would say." />
      <div className="stack gap-4">
        <div className="search">
          <label className="sr-only" htmlFor="title">Role title</label>
          <input id="title" value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder="Team Member" />
        </div>

        <div className="stack gap-2">
          <label className="t-sub" htmlFor="summary">
            In one sentence, what would they help with?
          </label>
          <div className="search">
            <input
              id="summary"
              value={draft.summary}
              onChange={(e) => set({ summary: e.target.value })}
              placeholder="Make drinks and keep the counter moving."
            />
          </div>
          <p className="t-meta">Optional, but it is the line students read first.</p>
        </div>
      </div>
      <Continue onClick={next} disabled={draft.title.trim().length === 0} />
    </>
  );
}

/* ---------- 3 · Who can do it ---------- */

const AGES: MinimumAge[] = [15, 16, 17, 18];
const EXPERIENCES: Experience[] = ['none', 'some', 'required'];

function WhoStep() {
  const { draft, set } = usePostDraft();
  const next = useNext(3);

  return (
    <>
      <Header question="Who can do it?" why="Setting this low is the single biggest thing that widens your pool." />
      <div className="stack gap-3">
        <h2 className="t-section">Minimum age</h2>
        <div className="chip-wrap">
          {AGES.map((age) => (
            <Chip key={age} label={`${age}+`} selected={draft.minimumAge === age} onClick={() => set({ minimumAge: age })} />
          ))}
        </div>
      </div>

      <div className="stack gap-3">
        <h2 className="t-section">Experience needed?</h2>
        <div className="answers">
          {EXPERIENCES.map((experience) => (
            <Tile
              key={experience}
              label={EXPERIENCE_EMPLOYER_LABEL[experience]}
              selected={draft.experience === experience}
              onClick={() => set({ experience })}
            />
          ))}
        </div>
      </div>

      <Continue onClick={next} disabled={draft.minimumAge === null || draft.experience === null} />
    </>
  );
}

/* ---------- 4 · When ---------- */

const HOURS: HoursBucket[] = ['under_10', '10_20', '20_plus', 'varies'];

function WhenStep() {
  const { draft, set } = usePostDraft();
  const next = useNext(4);

  const toggle = (timing: Timing) =>
    set({
      timing: draft.timing.includes(timing)
        ? draft.timing.filter((t) => t !== timing)
        : [...draft.timing, timing],
    });

  return (
    <>
      <Header question="When do you need help?" why="No shift schedule needed yet — this is just so students can tell if it fits." />
      <div className="chip-wrap">
        {EMPLOYER_TIMING.map((timing) => (
          <Chip key={timing} label={TIMING_LABEL[timing]} selected={draft.timing.includes(timing)} showTick onClick={() => toggle(timing)} />
        ))}
      </div>

      <div className="stack gap-3">
        <h2 className="t-section">Roughly how many hours a week?</h2>
        <p className="t-meta">Optional.</p>
        <div className="chip-wrap">
          {HOURS.map((hours) => (
            <Chip
              key={hours}
              label={HOURS_LABEL[hours]}
              selected={draft.hours === hours}
              onClick={() => set({ hours: draft.hours === hours ? null : hours })}
            />
          ))}
        </div>
      </div>

      <Continue onClick={next} disabled={draft.timing.length === 0} />
    </>
  );
}

/* ---------- 5 · Pay, and the preview ---------- */

const COMMITMENTS: VolunteerCommitment[] = ['one_time', 'weekly', 'monthly', 'flexible'];

function PayStep() {
  const { draft, set, clear } = usePostDraft();
  const { employerOrg, publishOpportunity } = useApp();
  const router = useRouter();

  const compensation = buildCompensation(draft);
  const complete = compensation !== null;

  const city = employerOrg ? DEFAULT_LOCATION.city : DEFAULT_LOCATION.city;
  const reach = estimateReach(city, draft.minimumAge ?? 16);

  const previewOrganization = useMemo<Organization>(
    () => ({
      id: 'org-preview',
      name: employerOrg?.name ?? 'Your organization',
      kind: employerOrg?.kind ?? 'business',
      verified: true,
      about: 'Your organization',
      location: DEFAULT_LOCATION,
    }),
    [employerOrg],
  );

  const previewOpportunity = useMemo<Opportunity | null>(() => {
    if (!complete || !draft.type || !draft.minimumAge || !draft.experience) return null;
    return {
      id: `opp-draft-${Date.now()}`,
      organizationId: previewOrganization.id,
      title: draft.title.trim(),
      type: draft.type,
      /* New postings are never live on submit. They queue for review. */
      status: 'PENDING_REVIEW',
      minimumAge: draft.minimumAge,
      experience: draft.experience,
      timing: draft.timing,
      hours: draft.hours ?? undefined,
      compensation,
      summary: draft.summary.trim(),
      reassurance: draft.summary.trim() || reassuranceFor(draft.experience),
      responsibilities: draft.summary.trim() ? [draft.summary.trim()] : [],
      schedule: draft.timing.map((t) => TIMING_LABEL[t]).join(', '),
      goodToKnow: [],
      interests: [],
      publishedAt: new Date().toISOString(),
    };
  }, [complete, draft, compensation, previewOrganization.id]);

  const post = () => {
    if (!previewOpportunity) return;
    publishOpportunity(previewOpportunity);
    clear();
    router.replace('/employer?posted=1');
  };

  return (
    <>
      <Header question={payQuestion(draft.type)} />

      {draft.type === 'volunteer' ? (
        <div className="chip-wrap">
          {COMMITMENTS.map((commitment) => (
            <Chip
              key={commitment}
              label={commitmentLabel(commitment)}
              selected={draft.commitment === commitment}
              onClick={() => set({ commitment })}
            />
          ))}
        </div>
      ) : null}

      {draft.type === 'internship' ? (
        <div className="chip-wrap">
          {(['paid', 'stipend', 'unpaid'] as const).map((mode) => (
            <Chip
              key={mode}
              label={mode === 'paid' ? 'Hourly pay' : mode === 'stipend' ? 'Stipend' : 'Unpaid'}
              selected={draft.internshipPay === mode}
              onClick={() => set({ internshipPay: mode })}
            />
          ))}
        </div>
      ) : null}

      {needsHourly(draft) ? (
        <div className="row gap-3">
          <MoneyField id="pay-min" label="From" value={draft.payMin} onChange={(payMin) => set({ payMin })} />
          <MoneyField id="pay-max" label="To (optional)" value={draft.payMax} onChange={(payMax) => set({ payMax })} />
        </div>
      ) : null}

      {draft.type === 'internship' && draft.internshipPay === 'stipend' ? (
        <MoneyField id="stipend" label="Total stipend" value={draft.stipend} onChange={(stipend) => set({ stipend })} />
      ) : null}

      {previewOpportunity ? (
        <section className="section">
          <h2 className="t-section">Here is what students will see</h2>
          <OpportunityCard
            item={{
              opportunity: previewOpportunity,
              organization: previewOrganization,
              fit: {
                eligible: true,
                blocker: null,
                lines: [],
                distance: 1.8,
                matchedTiming: previewOpportunity.timing,
              },
            }}
          />
          <p className="t-meta">
            About {reach} students nearby could see this. We review every posting by hand before it
            goes live, usually the same day.
          </p>
        </section>
      ) : null}

      <div className="sticky-cta">
        <div className="sticky-cta-row">
          <button type="button" className="btn btn-secondary" onClick={() => router.push('/employer/post/2')}>
            Edit
          </button>
          <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={post} disabled={!previewOpportunity}>
            Post Free
          </button>
        </div>
      </div>
    </>
  );
}

function MoneyField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="stack gap-2" style={{ flex: 1 }}>
      <label className="t-sub" htmlFor={id}>
        {label}
      </label>
      <div className="search">
        <span className="t-meta">$</span>
        <input
          id={id}
          value={value}
          inputMode="decimal"
          onChange={(event) => onChange(event.target.value.replace(/[^\d.]/g, ''))}
          placeholder="20"
        />
      </div>
    </div>
  );
}

function payQuestion(type: OpportunityType | null): string {
  if (type === 'volunteer') return 'What is the typical commitment?';
  if (type === 'internship') return 'Is it paid?';
  return "What's the pay?";
}

function commitmentLabel(commitment: VolunteerCommitment): string {
  return { one_time: 'One time', weekly: 'Weekly', monthly: 'Monthly', flexible: 'Flexible' }[commitment];
}

function reassuranceFor(experience: Experience): string {
  return experience === 'none'
    ? 'No experience needed — training provided.'
    : 'Some experience helps, but they will show you the rest.';
}

function needsHourly(draft: PostDraft): boolean {
  return draft.type === 'paid' || (draft.type === 'internship' && draft.internshipPay === 'paid');
}

function buildCompensation(draft: PostDraft): Compensation | null {
  if (!draft.type || !draft.title.trim() || !draft.minimumAge || !draft.experience || draft.timing.length === 0) {
    return null;
  }

  if (draft.type === 'volunteer') {
    return draft.commitment ? { kind: 'commitment', commitment: draft.commitment } : null;
  }

  if (draft.type === 'internship') {
    if (draft.internshipPay === 'unpaid') return { kind: 'unpaid' };
    if (draft.internshipPay === 'stipend') {
      const amount = Number(draft.stipend);
      return amount > 0 ? { kind: 'stipend', amount, per: 'total' } : null;
    }
  }

  const min = Number(draft.payMin);
  if (!(min > 0)) return null;
  const max = Number(draft.payMax);
  return max > min ? { kind: 'hourly', min, max } : { kind: 'hourly', min };
}
