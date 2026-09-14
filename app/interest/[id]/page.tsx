'use client';

import { notFound, useRouter } from 'next/navigation';
import { use, useState } from 'react';
import { BackButton, LoadingScreen, RequireProfile } from '@/components/Shell';
import { Tick } from '@/components/Icons';
import { Tile, TypeBadge } from '@/components/ui';
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
  const { profile, opportunities, organizations, expressInterest, updateProfile } = useApp();
  const router = useRouter();
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);

  const opportunity = opportunities.find((o) => o.id === id);
  if (!opportunity) notFound();
  const organization = organizations.find((o) => o.id === opportunity.organizationId);
  if (!organization) notFound();
  if (!profile) return <LoadingScreen />;

  /* Progressive profiling: the one thing worth knowing is asked here, at the
     moment it becomes useful, and "Not yet" is an equally good answer. */
  const answeredExperience = profile.hasSimilarExperience !== undefined;

  const send = () => {
    expressInterest(opportunity.id, note.trim() || undefined);
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

        <p className="t-meta">
          They will see: {profile.name}, {profile.age}, {profile.searchLocation.city}, roughly how
          far away you are, and when you are free.
        </p>
      </main>

      <div className="sticky-cta">
        <button type="button" className="btn btn-primary btn-block" onClick={send}>
          Send My Interest
        </button>
      </div>
    </div>
  );
}
