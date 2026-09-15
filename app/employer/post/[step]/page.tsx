'use client';

import { notFound, useRouter } from 'next/navigation';
import { use, useMemo, useState } from 'react';
import { BackButton } from '@/components/Shell';
import { Chip, MoneyField, ProgressRail, Tile } from '@/components/ui';
import { OpportunityCard } from '@/components/OpportunityCard';
import { usePostDraft, type PostDraft } from '@/components/PostDraft';
import {
  EMPLOYER_TIMING,
  EXPERIENCE_EMPLOYER_LABEL,
  HOURS_LABEL,
  TIMING_LABEL,
  listPhrase,
} from '@/lib/copy';
import { DEFAULT_LOCATION } from '@/lib/geo';
import { agesExcluded, reachFor, type Reach } from '@/lib/reach';
import {
  compensationFrom,
  draftToOpportunity,
  type OpportunityDraft,
} from '@/lib/opportunityDraft';
import { useEmployer } from '@/lib/useEmployer';
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
  const { organization } = useEmployer();
  const next = useNext(1);

  /* The volunteer safety rule: a business cannot classify ordinary work as
     volunteering. Hidden here so nobody wastes four screens on it, and
     refused again on the server, where a modified request cannot get round
     it. */
  const canPostVolunteer = organization?.kind !== 'business';

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
  const { organization } = useEmployer();
  const router = useRouter();
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  const compensation = compensationFrom(draft);

  const reach = draft.minimumAge
    ? reachFor({ city: DEFAULT_LOCATION.city, minimumAge: draft.minimumAge })
    : ({ known: false } as const);

  const previewOrganization = useMemo<Organization>(
    () => ({
      id: organization?.id ?? 'org-preview',
      name: organization?.name ?? 'Your organization',
      kind: organization?.kind ?? 'business',
      verificationStatus: 'VERIFIED',
      about: 'Your organization',
      location: DEFAULT_LOCATION,
    }),
    [organization],
  );

  /* The form builds the same draft a voice or pasted posting would, and the
     same function turns it into the Opportunity. Nothing downstream knows
     which route it came from. */
  const previewOpportunity = useMemo<Opportunity | null>(() => {
    const shared: OpportunityDraft = {
      source: 'form',
      type: draft.type,
      title: draft.title,
      summary: draft.summary,
      minimumAge: draft.minimumAge,
      experience: draft.experience,
      timing: draft.timing,
      hours: draft.hours,
      compensation,
    };
    const built = draftToOpportunity(shared, previewOrganization.id, 'PENDING');
    if (!built) return null;
    return { ...built, schedule: draft.timing.map((t) => TIMING_LABEL[t]).join(', ') };
  }, [draft, compensation, previewOrganization.id]);

  /* The posting now leaves the browser. Same draft, same converter, but the
     server decides the status from the organization's verification — a
     posting is never more trusted than the organization behind it. */
  const post = async () => {
    if (!previewOpportunity || posting) return;
    setPosting(true);
    setPostError(null);

    const shared: OpportunityDraft = {
      source: 'form',
      type: draft.type,
      title: draft.title,
      summary: draft.summary,
      minimumAge: draft.minimumAge,
      experience: draft.experience,
      timing: draft.timing,
      hours: draft.hours,
      compensation,
    };

    const response = await fetch('/api/employer/opportunities', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ draft: shared }),
    });

    if (!response.ok) {
      const detail = (await response.json().catch(() => null)) as { error?: string } | null;
      setPostError(detail?.error ?? 'Could not post that. Try again in a moment.');
      setPosting(false);
      return;
    }

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
          <ReachNote reach={reach} minimumAge={draft.minimumAge} />
        </section>
      ) : null}

      {postError ? (
        <p className="t-meta" role="alert" style={{ color: 'var(--warn)' }}>
          {postError}
        </p>
      ) : null}

      <div className="sticky-cta">
        <div className="sticky-cta-row">
          <button type="button" className="btn btn-secondary" onClick={() => router.push('/employer/post/2')}>
            Edit
          </button>
          <button
            type="button"
            className="btn btn-primary"
            style={{ flex: 1 }}
            onClick={post}
            disabled={!previewOpportunity || posting}
          >
            {posting ? 'Posting…' : 'Post Free'}
          </button>
        </div>
      </div>
    </>
  );
}

/* Two branches, and only one of them shows a number. Until there are real
   students to count, the employer is told what their own settings do — which
   is true by construction and more actionable than an estimate anyway. */

function ReachNote({ reach, minimumAge }: { reach: Reach; minimumAge: MinimumAge | null }) {
  const review = 'We check every posting by hand before it goes live, usually the same day.';

  if (reach.known) {
    return (
      <p className="t-meta">
        About {reach.count} students nearby could see this. {review}
      </p>
    );
  }

  const excluded = minimumAge ? agesExcluded(minimumAge) : [];

  return (
    <p className="t-meta">
      {excluded.length === 0
        ? 'Open to every age we serve, which is the widest this can reach.'
        : `Students aged ${listPhrase(excluded.map(String))} will not see this.`}{' '}
      {review}
    </p>
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

function needsHourly(draft: PostDraft): boolean {
  return draft.type === 'paid' || (draft.type === 'internship' && draft.internshipPay === 'paid');
}

