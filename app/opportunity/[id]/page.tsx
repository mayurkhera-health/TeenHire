'use client';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { use, useState } from 'react';
import { BackButton, LoadingScreen } from '@/components/Shell';
import { EligibilityPanel } from '@/components/EligibilityPanel';
import { MoneyBlock } from '@/components/MoneyBlock';
import { Cake, Clock, Heart, Pin, Spark } from '@/components/Icons';
import { Sheet, StripedFill, TypeBadge, VerifiedBadge } from '@/components/ui';
import {
  COMMITMENT_LABEL,
  EXPERIENCE_LABEL,
  HOURS_LABEL,
  postedPhrase,
  timingPhrase,
} from '@/lib/copy';
import { formatDistance } from '@/lib/geo';
import { isVerified } from '@/lib/types';
import { useOpportunities, usePublicOpportunity } from '@/lib/useOpportunities';
import { DataError, DataLoading } from '@/components/DataError';
import { useApp } from '@/lib/store';
import { useRouter } from 'next/navigation';

/* Relevance before detail. Everything a student needs to decide sits above
   the first body paragraph: what it pays, how far it is, when it runs and
   whether they can actually do it. */

/* Not behind RequireProfile.
 *
 * It used to be, which meant a link a student sent a friend redirected that
 * friend to the welcome screen with no sign of what had been shared — and the
 * same thing happened to a student who cleared their browser or opened
 * TeenHire on a different phone. The personalised half of this screen does
 * need a profile; the posting does not, and hiding the posting to protect the
 * fit panel was the wrong trade. */
export default function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { ready, profile } = useApp();

  if (!ready) return <LoadingScreen />;
  return profile ? <Detail id={id} /> : <PublicDetail id={id} />;
}

function Detail({ id }: { id: string }) {
  const { profile, isSaved, toggleSaved, applicationFor } = useApp();
  const [trustOpen, setTrustOpen] = useState(false);

  /* Fetched by id and not filtered: a student who follows a link from a friend
     has to reach this screen even when they cannot do the job, because the
     eligibility panel and the alternatives count are the point of arriving. */
  const { items, loading, error, reload } = useOpportunities(profile, { ids: [id] });

  if (!profile) return <LoadingScreen />;

  if (error) {
    return (
      <div className="screen">
        <main className="page gutter">
          <div className="row gap-3">
            <BackButton />
          </div>
          <DataError onRetry={reload} />
        </main>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="screen">
        <main className="page gutter">
          <div className="row gap-3">
            <BackButton />
          </div>
          <DataLoading label="Loading this one…" />
        </main>
      </div>
    );
  }

  const match = items[0];
  if (!match) notFound();

  const { opportunity, organization, fit } = match;
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
            {isVerified(organization) ? (
              <button type="button" className="tap" onClick={() => setTrustOpen(true)}>
                <VerifiedBadge />
              </button>
            ) : null}
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

        {!fit.eligible ? <Alternatives opportunityId={opportunity.id} /> : null}

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

      <Sheet open={trustOpen} title="Verified organization" onClose={() => setTrustOpen(false)}>
        <p className="t-body">
          We&rsquo;ve confirmed this is a real organization — the business exists, the address is
          real, and a named person there is responsible for this posting.
        </p>
        {/* Saying what the badge does not cover matters more than what it does.
            A student should not read it as us vouching for the workplace. */}
        <p className="t-body">
          It doesn&rsquo;t mean we&rsquo;ve checked the pay, the hours, or what it&rsquo;s like to
          work there. Tell a parent or guardian where you&rsquo;re going, and tell us if anything
          feels wrong.
        </p>
        <button type="button" className="btn btn-primary btn-block" onClick={() => setTrustOpen(false)}>
          Got it
        </button>
      </Sheet>

      <div className="sticky-cta" data-inline-on-pointer="true">
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
          ) : (
            /* A student who cannot do this one is not locked out of it — the
               rules can be wrong, and being told no by software is worse than
               being told no by a person. It just stops leading: when they are
               not eligible the panel above carries the better next step, with
               a real count attached, and this drops to secondary. */
            <Link
              href={`/interest/${opportunity.id}`}
              className={`btn ${fit.eligible ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1 }}
            >
              I'm Interested
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

/* §10: never a disabled button and nothing else. A student who cannot do this
   one is told plainly why, then handed the count of what they can do — which
   is a real number from the same rules the feed runs, not a guess. */
function Alternatives({ opportunityId }: { opportunityId: string }) {
  const { profile } = useApp();
  const { items, loading } = useOpportunities(profile);
  if (!profile || loading) return null;

  const count = items.filter((r) => r.opportunity.id !== opportunityId).length;
  if (count === 0) return null;

  return (
    <div className="panel-ink">
      <h2 className="t-section" style={{ color: '#fff' }}>
        We found {count} you can do
      </h2>
      <p className="t-body">
        All of them are near you, and you are old enough for every one.
      </p>
      <Link href="/discover" className="btn btn-yellow">
        Show me those
      </Link>
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

/* What a shared link shows before there is a profile.
 *
 * Everything true of the posting whatever anyone's age or address is — what it
 * pays, when it runs, the minimum age, who is offering it. No distance, no
 * "you can apply", because there is nobody to say that about yet.
 *
 * The invitation goes to onboarding rather than to the account gate. Asking a
 * stranger for their email before showing them anything is the friction the
 * whole deferred-registration design exists to avoid, and they have already
 * seen the job by this point — the five questions now buy them an answer to a
 * question they are actually asking. */
function PublicDetail({ id }: { id: string }) {
  const { item, loading, error, reload } = usePublicOpportunity(id);
  const { setDraft } = useApp();
  const router = useRouter();

  if (loading) {
    return (
      <div className="screen">
        <main className="page gutter">
          <DataLoading label="Loading this one…" />
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="screen">
        <main className="page gutter">
          <DataError onRetry={reload} />
        </main>
      </div>
    );
  }

  if (!item) notFound();

  const { opportunity, organization } = item;

  const findOut = () => {
    /* Remembered so the five questions end where they started. Onboarding
       always finished at the feed, so a friend who did answer them still
       never reached the job they were sent. */
    setDraft({ next: `/opportunity/${opportunity.id}` });
    router.push('/start');
  };

  return (
    <div className="screen">
      <main className="page gutter">
        <div className="row gap-3">
          <TypeBadge type={opportunity.type} />
          {isVerified(organization) ? <VerifiedBadge /> : null}
        </div>

        <header className="stack gap-2">
          <h1 className="t-display">{opportunity.title}</h1>
          <p className="t-sub">
            {organization.name} · {organization.location.city}
          </p>
        </header>

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
          {opportunity.hours ? (
            <span className="meta-item">{HOURS_LABEL[opportunity.hours]}</span>
          ) : null}
        </div>

        {opportunity.reassurance ? <p className="t-body">{opportunity.reassurance}</p> : null}
        {opportunity.summary && opportunity.summary !== opportunity.reassurance ? (
          <p className="t-body">{opportunity.summary}</p>
        ) : null}

        <div className="fit">
          <h2 className="fit-heading">Does this fit you?</h2>
          <p className="fit-line">
            Five questions, about a minute, and you will see whether you can do this one and how
            far away it is.
          </p>
          <p className="fit-line">No account needed to look — we ask for that later, if ever.</p>
        </div>

        <p className="t-meta">{postedPhrase(opportunity.publishedAt)}</p>
      </main>

      <div className="sticky-cta">
        <button type="button" className="btn btn-primary btn-block" onClick={findOut}>
          Find out if this fits me
        </button>
      </div>
    </div>
  );
}
