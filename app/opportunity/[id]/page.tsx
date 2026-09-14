'use client';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { use } from 'react';
import { BackButton, LoadingScreen, RequireProfile } from '@/components/Shell';
import { EligibilityPanel } from '@/components/EligibilityPanel';
import { MoneyBlock } from '@/components/MoneyBlock';
import { Cake, Clock, Heart, Pin, Spark } from '@/components/Icons';
import { StripedFill, TypeBadge, VerifiedBadge } from '@/components/ui';
import {
  COMMITMENT_LABEL,
  EXPERIENCE_LABEL,
  HOURS_LABEL,
  postedPhrase,
  timingPhrase,
} from '@/lib/copy';
import { formatDistance } from '@/lib/geo';
import { evaluateFit } from '@/lib/matching';
import { useApp } from '@/lib/store';

/* Relevance before detail. Everything a student needs to decide sits above
   the first body paragraph: what it pays, how far it is, when it runs and
   whether they can actually do it. */

export default function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RequireProfile>
      <Detail id={id} />
    </RequireProfile>
  );
}

function Detail({ id }: { id: string }) {
  const { profile, opportunities, organizations, isSaved, toggleSaved, applicationFor } = useApp();

  const opportunity = opportunities.find((o) => o.id === id);
  if (!opportunity) notFound();

  const organization = organizations.find((o) => o.id === opportunity.organizationId);
  if (!organization) notFound();
  if (!profile) return <LoadingScreen />;

  const fit = evaluateFit(opportunity, organization, profile);
  const saved = isSaved(opportunity.id);
  const application = applicationFor(opportunity.id);

  return (
    <div className="screen">
      <main className="page gutter">
        <div className="row gap-3">
          <BackButton />
          <span className="t-eyebrow">{postedPhrase(opportunity.publishedAt)}</span>
        </div>

        <StripedFill type={opportunity.type} className="hero" />

        <div className="stack gap-3">
          <div className="meta-row">
            <TypeBadge type={opportunity.type} />
            {organization.verified ? <VerifiedBadge /> : null}
          </div>
          <h1 className="t-display" style={{ fontSize: 30 }}>
            {opportunity.title}
          </h1>
          <p className="t-meta">
            {organization.name} · {organization.location.city} ·{' '}
            {formatDistance(fit.distance)} away
          </p>
        </div>

        <MoneyBlock
          compensation={opportunity.compensation}
          timing={opportunity.timing}
          hours={opportunity.hours}
        />

        <div className="meta-row">
          <span className="meta-item">
            <Cake />
            {opportunity.minimumAge}+
          </span>
          <span className="meta-item">
            <Clock />
            {timingPhrase(opportunity.timing)}
          </span>
          <span className="meta-item">
            <Spark />
            {EXPERIENCE_LABEL[opportunity.experience]}
          </span>
        </div>

        <EligibilityPanel fit={fit} />

        <Section title="What you'll do">
          <div className="bullets">
            {opportunity.responsibilities.map((line) => (
              <p className="bullet" key={line}>
                {line}
              </p>
            ))}
          </div>
        </Section>

        <Section title="When you'd work">
          <p className="t-body">{opportunity.schedule}</p>
          {opportunity.hours ? <p className="t-meta">{HOURS_LABEL[opportunity.hours]}</p> : null}
          {opportunity.compensation.kind === 'commitment' ? (
            <p className="t-meta">
              Typical commitment: {COMMITMENT_LABEL[opportunity.compensation.commitment].toLowerCase()}
            </p>
          ) : null}
        </Section>

        <Section title="Who can apply">
          <div className="bullets">
            <p className="bullet">{opportunity.minimumAge} or older</p>
            <p className="bullet">Free {timingPhrase(opportunity.timing).toLowerCase()}</p>
            <p className="bullet">{EXPERIENCE_LABEL[opportunity.experience]}</p>
          </div>
        </Section>

        <Section title="About this place">
          <p className="t-body">{organization.about}</p>
        </Section>

        <Section title="Location">
          <div className="map">
            <StripedFill
              type={opportunity.type}
              className=""
            />
            <p className="t-meta" style={{ position: 'relative' }}>
              Around {organization.location.city} {organization.location.zip} ·{' '}
              {formatDistance(fit.distance)} from you
            </p>
          </div>
          <p className="t-meta">
            We show the neighbourhood, not the doorstep. You get the exact address once you have
            both said yes.
          </p>
        </Section>

        <Section title="Good to know">
          <div className="bullets">
            {opportunity.goodToKnow.map((line) => (
              <p className="bullet" key={line}>
                {line}
              </p>
            ))}
          </div>
        </Section>
      </main>

      <div className="sticky-cta" data-inline-on-pointer="true">
        {!fit.eligible && !application ? (
          <Link href={`/interest/${opportunity.id}`} className="btn btn-tertiary">
            Send my interest anyway
          </Link>
        ) : null}
        <div className="sticky-cta-row">
          <button
            type="button"
            className="btn btn-secondary"
            aria-pressed={saved}
            onClick={() => toggleSaved(opportunity.id)}
          >
            <Heart size={20} filled={saved} />
            <span className="sr-only">{saved ? 'Saved' : 'Save'}</span>
          </button>

          {application ? (
            <Link href="/activity" className="btn btn-secondary" style={{ flex: 1 }}>
              Interest sent — see activity
            </Link>
          ) : fit.eligible ? (
            <Link
              href={`/interest/${opportunity.id}`}
              className="btn btn-primary"
              style={{ flex: 1 }}
            >
              I'm Interested
            </Link>
          ) : (
            /* A student who cannot do this one is not locked out of it — the
               rules can be wrong, and being told no by software is worse than
               being told no by a person. But it stops being the leading
               action, because the better next step is the one that fits. */
            <Link href="/discover" className="btn btn-primary" style={{ flex: 1 }}>
              Find ones I can do
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="detail-section">
      <h2 className="t-section">{title}</h2>
      {children}
    </section>
  );
}
