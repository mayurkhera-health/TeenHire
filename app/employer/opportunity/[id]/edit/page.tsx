'use client';

import { useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useMemo, useState } from 'react';
import { BackButton } from '@/components/Shell';
import { DataError, DataLoading } from '@/components/DataError';
import { Chip, MoneyField, Tile } from '@/components/ui';
import {
  COMMITMENT_LABEL,
  EMPLOYER_TIMING,
  EXPERIENCE_EMPLOYER_LABEL,
  HOURS_LABEL,
  TIMING_LABEL,
} from '@/lib/copy';
import type {
  Compensation,
  Experience,
  HoursBucket,
  MinimumAge,
  OpportunityType,
  Timing,
  VolunteerCommitment,
} from '@/lib/types';

/* Editing is one screen, not the five-step wizard again.
 *
 * The wizard's job is to get a first posting out of somebody who has never
 * written one; an employer who wants to change the pay already knows what
 * this is and wants to see every field at once. Same fields, same controls,
 * same validator on the server — only the pacing is different. */

interface EditablePosting {
  id: string;
  title: string;
  type: string;
  status: string;
  minimumAge: number;
  experience: string;
  timing: string[];
  hours: string | null;
  compensation: Compensation;
  summary: string;
  interestedAges: number[];
}

const AGES: MinimumAge[] = [15, 16, 17, 18];
const EXPERIENCES: Experience[] = ['none', 'some', 'required'];
const HOURS: HoursBucket[] = ['under_10', '10_20', '20_plus', 'varies'];
const COMMITMENTS: VolunteerCommitment[] = ['one_time', 'weekly', 'monthly', 'flexible'];

interface Pay {
  payMin: string;
  payMax: string;
  internshipPay: 'paid' | 'stipend' | 'unpaid' | null;
  stipend: string;
  commitment: VolunteerCommitment | null;
}

/* The stored compensation unpacked back into the fields that produced it, so
   an employer opening the edit screen sees what they typed rather than a
   blank form that would silently overwrite it. */
function payFrom(compensation: Compensation): Pay {
  const empty: Pay = {
    payMin: '',
    payMax: '',
    internshipPay: null,
    stipend: '',
    commitment: null,
  };
  switch (compensation.kind) {
    case 'hourly':
      return {
        ...empty,
        payMin: String(compensation.min),
        payMax: compensation.max ? String(compensation.max) : '',
        internshipPay: 'paid',
      };
    case 'stipend':
      return { ...empty, internshipPay: 'stipend', stipend: String(compensation.amount) };
    case 'unpaid':
      return { ...empty, internshipPay: 'unpaid' };
    case 'commitment':
      return { ...empty, commitment: compensation.commitment };
  }
}

export default function EditPostingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [posting, setPosting] = useState<EditablePosting | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [minimumAge, setMinimumAge] = useState<MinimumAge | null>(null);
  const [experience, setExperience] = useState<Experience | null>(null);
  const [timing, setTiming] = useState<Timing[]>([]);
  const [hours, setHours] = useState<HoursBucket | null>(null);
  const [pay, setPay] = useState<Pay>(payFrom({ kind: 'unpaid' }));

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const response = await fetch(`/api/employer/opportunities/${id}`);
      if (!response.ok) throw new Error('load');
      const { posting: loaded } = (await response.json()) as { posting: EditablePosting };
      setPosting(loaded);
      setTitle(loaded.title);
      setSummary(loaded.summary);
      setMinimumAge(loaded.minimumAge as MinimumAge);
      setExperience(loaded.experience as Experience);
      setTiming(loaded.timing as Timing[]);
      setHours(loaded.hours as HoursBucket | null);
      setPay(payFrom(loaded.compensation));
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const type = posting?.type as OpportunityType | undefined;

  /* Raising the minimum age does not remove students who already put their
     hand up — they applied under the terms that were published, and dropping
     them silently would be a decision made by nobody. What it does is stop
     new ones arriving, and mark the ones already there. They are never named:
     a count is all the employer needs, and all §33 would let us show. */
  const wouldDisqualify = useMemo(() => {
    if (!posting || minimumAge === null) return 0;
    return posting.interestedAges.filter((age) => age < minimumAge).length;
  }, [posting, minimumAge]);

  const toggleTiming = (value: Timing) =>
    setTiming((current) =>
      current.includes(value) ? current.filter((t) => t !== value) : [...current, value],
    );

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setSaveError(null);

    const response = await fetch(`/api/employer/opportunities/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, summary, minimumAge, experience, timing, hours, pay }),
    });

    if (!response.ok) {
      const detail = (await response.json().catch(() => null)) as { error?: string } | null;
      setSaveError(detail?.error ?? 'Could not save that. Try again in a moment.');
      setSaving(false);
      return;
    }

    router.replace('/employer?saved=1');
  };

  if (loading) {
    return (
      <div className="screen">
        <main className="page gutter console">
          <BackButton />
          <DataLoading label="Loading this posting…" />
        </main>
      </div>
    );
  }

  if (loadError || !posting || !type) {
    return (
      <div className="screen">
        <main className="page gutter console">
          <BackButton />
          <DataError onRetry={load} />
        </main>
      </div>
    );
  }

  const needsHourly = type === 'paid' || (type === 'internship' && pay.internshipPay === 'paid');

  return (
    <div className="screen">
      <main className="page gutter console">
        <BackButton />

        <header className="stack gap-2">
          <span className="t-eyebrow">Editing</span>
          <h1 className="t-greeting">{posting.title}</h1>
          <p className="t-sub">
            Changes show up for students straight away. What you are offering stays fixed — post
            a new one if that has changed.
          </p>
        </header>

        <section className="section stack gap-4">
          <h2 className="t-section">What it is called</h2>
          <div className="search">
            <label className="sr-only" htmlFor="edit-title">
              Role title
            </label>
            <input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="stack gap-2">
            <label className="t-sub" htmlFor="edit-summary">
              In one sentence, what would they help with?
            </label>
            <div className="search">
              <input
                id="edit-summary"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Make drinks and keep the counter moving."
              />
            </div>
          </div>
        </section>

        <section className="section stack gap-4">
          <h2 className="t-section">Minimum age</h2>
          <div className="chip-wrap">
            {AGES.map((age) => (
              <Chip
                key={age}
                label={`${age}+`}
                selected={minimumAge === age}
                onClick={() => setMinimumAge(age)}
              />
            ))}
          </div>

          {wouldDisqualify > 0 ? (
            <div className="fit" data-eligible="false" role="status">
              <h3 className="fit-heading">
                {wouldDisqualify === 1
                  ? 'One student already interested is under this age'
                  : `${wouldDisqualify} students already interested are under this age`}
              </h3>
              <p className="fit-line">
                They stay on your list — they applied before you changed this — but they will be
                marked as under your new minimum. Nobody under {minimumAge} will see the posting
                from now on.
              </p>
            </div>
          ) : null}

          <h2 className="t-section">Experience needed?</h2>
          <div className="answers">
            {EXPERIENCES.map((value) => (
              <Tile
                key={value}
                label={EXPERIENCE_EMPLOYER_LABEL[value]}
                selected={experience === value}
                onClick={() => setExperience(value)}
              />
            ))}
          </div>
        </section>

        <section className="section stack gap-4">
          <h2 className="t-section">When you need help</h2>
          <div className="chip-wrap">
            {EMPLOYER_TIMING.map((value) => (
              <Chip
                key={value}
                label={TIMING_LABEL[value]}
                selected={timing.includes(value)}
                showTick
                onClick={() => toggleTiming(value)}
              />
            ))}
          </div>

          <h2 className="t-section">Roughly how many hours a week?</h2>
          <div className="chip-wrap">
            {HOURS.map((value) => (
              <Chip
                key={value}
                label={HOURS_LABEL[value]}
                selected={hours === value}
                onClick={() => setHours(hours === value ? null : value)}
              />
            ))}
          </div>
        </section>

        <section className="section stack gap-4">
          <h2 className="t-section">
            {type === 'volunteer' ? 'Typical commitment' : type === 'internship' ? 'Is it paid?' : 'Pay'}
          </h2>

          {type === 'volunteer' ? (
            <div className="chip-wrap">
              {COMMITMENTS.map((value) => (
                <Chip
                  key={value}
                  label={COMMITMENT_LABEL[value]}
                  selected={pay.commitment === value}
                  onClick={() => setPay({ ...pay, commitment: value })}
                />
              ))}
            </div>
          ) : null}

          {type === 'internship' ? (
            <div className="chip-wrap">
              {(['paid', 'stipend', 'unpaid'] as const).map((mode) => (
                <Chip
                  key={mode}
                  label={mode === 'paid' ? 'Hourly pay' : mode === 'stipend' ? 'Stipend' : 'Unpaid'}
                  selected={pay.internshipPay === mode}
                  onClick={() => setPay({ ...pay, internshipPay: mode })}
                />
              ))}
            </div>
          ) : null}

          {needsHourly ? (
            <div className="row gap-3">
              <MoneyField
                id="edit-pay-min"
                label="From"
                value={pay.payMin}
                onChange={(payMin) => setPay({ ...pay, payMin })}
              />
              <MoneyField
                id="edit-pay-max"
                label="To (optional)"
                value={pay.payMax}
                onChange={(payMax) => setPay({ ...pay, payMax })}
              />
            </div>
          ) : null}

          {type === 'internship' && pay.internshipPay === 'stipend' ? (
            <MoneyField
              id="edit-stipend"
              label="Total stipend"
              value={pay.stipend}
              onChange={(stipend) => setPay({ ...pay, stipend })}
            />
          ) : null}
        </section>

        {saveError ? (
          <p className="t-meta" role="alert" style={{ color: 'var(--warn)' }}>
            {saveError}
          </p>
        ) : null}
      </main>

      <div className="sticky-cta">
        <div className="sticky-cta-row">
          <button type="button" className="btn btn-secondary" onClick={() => router.back()}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            style={{ flex: 1 }}
            onClick={save}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
