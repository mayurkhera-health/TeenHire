'use client';

import { notFound, useRouter } from 'next/navigation';
import { use, useState } from 'react';
import { AccountGate } from '@/components/AccountGate';
import { BackButton, LoadingScreen, RequireProfile } from '@/components/Shell';
import { DataError, DataLoading } from '@/components/DataError';
import { useOpportunities } from '@/lib/useOpportunities';
import { Tick } from '@/components/Icons';
import { maskContact } from '@/lib/auth';
import { Tile, TypeBadge } from '@/components/ui';
import { TIMING_LABEL, listPhrase } from '@/lib/copy';
import { useApp } from '@/lib/store';

/* Not "Apply Now". A student is telling an organization they are interested,
   which is a far smaller thing to do, and the flow is sized to match: one
   optional sentence and one question, both of which can be answered wrong
   without consequence. */

const NOTE_LIMIT = 250;

export default function InterestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RequireProfile>
      <Interest id={id} />
    </RequireProfile>
  );
}

function Interest({ id }: { id: string }) {
  const { profile, expressInterest, updateProfile, account } = useApp();
  const { items, loading, error, reload } = useOpportunities(profile, { ids: [id] });
  const router = useRouter();
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  if (!profile) return <LoadingScreen />;

  if (error) {
    return (
      <div className="screen">
        <main className="page gutter">
          <BackButton />
          <DataError onRetry={reload} />
        </main>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="screen">
        <main className="page gutter">
          <BackButton />
          <DataLoading label="One moment…" />
        </main>
      </div>
    );
  }

  const match = items[0];
  if (!match) notFound();
  const { opportunity, organization } = match;

  /* Progressive profiling: the one thing worth knowing is asked here, at the
     moment it becomes useful, and "Not yet" is an equally good answer. */
  const answeredExperience = profile.hasSimilarExperience !== undefined;

  const availability =
    profile.availability.length > 0
      ? profile.availability.map((t) => TIMING_LABEL[t].toLowerCase()).join(' and ')
      : 'when it suits you';

  const background =
    profile.thingsDone.length > 0
      ? `You've done: ${listPhrase(profile.thingsDone).toLowerCase()}`
      : profile.hasSimilarExperience
        ? "You've done something like this before"
        : 'This would be a first — which is fine here';

  /* The send now goes to the server and can fail — the opportunity may have
     been filled or withdrawn while the student was typing. Claiming it was
     sent when it was not is the one outcome this screen must never produce. */
  const send = async () => {
    if (sending) return;
    setSending(true);
    setSendError(null);
    const result = await expressInterest(opportunity.id, note.trim() || undefined);
    setSending(false);
    if (!result.ok) {
      setSendError(result.error ?? 'Could not send that just now');
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <div className="screen">
        <main className="page gutter" style={{ justifyContent: 'center' }}>
          <div className="fit">
            <Tick size={26} />
            <h1 className="t-display" style={{ fontSize: 28, color: 'var(--teal-wash-ink)' }}>
              Sent to {organization.name}
            </h1>
            <p className="fit-line">
              They can see your first name, your age, roughly how far away you are and when you are
              free. Nothing else.
            </p>
            {account ? (
              <p className="fit-line">They will reply to {maskContact(account)}.</p>
            ) : null}
          </div>
          <p className="t-body">
            Most places reply within a few days. You will see it under Activity either way.
          </p>
        </main>
        <div className="sticky-cta">
          <div className="sticky-cta-row">
            <button
              type="button"
              className="btn btn-secondary"
              style={{ flex: 1 }}
              onClick={() => router.push('/activity')}
            >
              See activity
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ flex: 1 }}
              onClick={() => router.push('/discover')}
            >
              Keep looking
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* The gate. Everything before this point — browsing, onboarding, saving —
     happened without an account, because none of it left the device. This is
     the first thing that does. */
  if (!account) {
    return (
      <div className="screen">
        <main className="page gutter">
          <div className="row gap-3">
            <BackButton />
            <TypeBadge type={opportunity.type} />
          </div>
          <AccountGate
            organizationName={organization.name}
            onDone={() => {
              /* Signing in re-renders this screen past the gate, with the
                 opportunity they were looking at still underneath. Nothing
                 they typed is lost and nothing needs re-finding. */
            }}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="screen">
      <main className="page gutter">
        <div className="row gap-3">
          <BackButton />
          <TypeBadge type={opportunity.type} />
        </div>

        <div className="question">
          <h1 className="t-display" style={{ fontSize: 30 }}>
            Before we send your profile
          </h1>
          <p className="t-meta">
            {opportunity.title} at {organization.name}
          </p>
        </div>

        <div className="stack gap-3">
          <label className="t-section" htmlFor="note">
            Why does this look interesting?
          </label>
          <p className="t-meta">Optional. A sentence is plenty — no cover letter.</p>
          <textarea
            id="note"
            className="panel"
            rows={4}
            maxLength={NOTE_LIMIT}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="I can walk there after school and I like being around people."
            style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: 15, lineHeight: 1.55 }}
          />
          <p className="t-meta" aria-live="polite">
            {NOTE_LIMIT - note.length} characters left
          </p>
        </div>

        {!answeredExperience ? (
          <div className="stack gap-3">
            <h2 className="t-section">One quick thing</h2>
            <p className="t-meta">Have you done anything similar before?</p>
            <div className="answers">
              <Tile
                label="Yes"
                note="We'll mention it, not quiz you on it"
                selected={profile.hasSimilarExperience === true}
                onClick={() => updateProfile({ hasSimilarExperience: true })}
              />
              <Tile
                label="Not yet"
                note="That's completely fine"
                selected={profile.hasSimilarExperience === false}
                onClick={() => updateProfile({ hasSimilarExperience: false })}
              />
            </div>
          </div>
        ) : null}

        {/* §14: the student sees exactly what travels, before it travels.
            Four lines, all of them things they already told us. */}
        <section className="fit">
          <h2 className="fit-heading">Ready to send?</h2>
          <p className="fit-line">
            <Tick size={16} />
            {profile.name}, {profile.age}
          </p>
          <p className="fit-line">
            <Tick size={16} />
            Old enough for this one
          </p>
          <p className="fit-line">
            <Tick size={16} />
            Free {availability}
          </p>
          <p className="fit-line">
            <Tick size={16} />
            {background}
          </p>
          <p className="fit-line" style={{ opacity: 0.8 }}>
            Not sent: your address, your birthday or where exactly you searched from.
          </p>
        </section>
      </main>

      {sendError ? (
        <p className="t-meta" role="alert" style={{ color: 'var(--warn)' }}>
          {sendError}
        </p>
      ) : null}

      <div className="sticky-cta">
        <button type="button" className="btn btn-primary btn-block" onClick={send} disabled={sending}>
          {sending ? 'Sending…' : 'Send My Interest'}
        </button>
      </div>
    </div>
  );
}
