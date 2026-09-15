'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DataError, DataLoading } from '@/components/DataError';
import { Plus } from '@/components/Icons';
import { LogoTile, TypeBadge } from '@/components/ui';
import { payHeadline, timingPhrase } from '@/lib/copy';
import { useEmployer, type Posting } from '@/lib/useEmployer';
import type { Compensation, OpportunityStatus, OpportunityType, Timing } from '@/lib/types';

/* The console answers two questions and no others: what do I have open, and
   who is interested. Both now come from the database, so the numbers are real
   people rather than a fixture. */

const STATUS_COPY: Record<OpportunityStatus, string> = {
  DRAFT: 'Draft',
  PENDING_REVIEW: 'In review',
  PUBLISHED: 'Live',
  PAUSED: 'Paused',
  FILLED: 'Filled',
  EXPIRED: 'Expired',
  REJECTED: 'Not approved',
};

export default function EmployerHome() {
  const { organization, postings, loading, error, reload, setStatus } = useEmployer();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !error && !organization) router.replace('/employer/signup');
  }, [loading, error, organization, router]);

  if (loading) {
    return (
      <div className="screen">
        <main className="page gutter console">
          <DataLoading label="Loading your opportunities…" />
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="screen">
        <main className="page gutter console">
          <DataError onRetry={reload} />
        </main>
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="screen">
        <main className="page gutter console">
          <DataLoading label="One moment…" />
        </main>
      </div>
    );
  }

  return (
    <div className="screen">
      <main className="page gutter console">
        <header className="stack gap-2">
          <span className="t-eyebrow">{organization.name}</span>
          <h1 className="t-greeting">Your opportunities</h1>
        </header>

        <Suspense fallback={null}>
          <JustPosted verified={organization.verificationStatus === 'VERIFIED'} />
        </Suspense>

        <div className="console-grid">
          <nav className="stack gap-2" aria-label="Console">
            <Link href="/employer" className="btn btn-secondary btn-block">
              Opportunities
            </Link>
            <Link href="/discover" className="btn btn-tertiary btn-inline">
              See the student view
            </Link>
          </nav>

          <div className="stack gap-5">
            {postings.length === 0 ? (
              <div className="panel-ink">
                <h2 className="t-section" style={{ color: '#fff' }}>
                  Nothing posted yet
                </h2>
                <p className="t-body">
                  Five questions, about two minutes, and it costs nothing to post.
                </p>
                <Link href="/employer/post/1" className="btn btn-primary">
                  <Plus />
                  Post Opportunity
                </Link>
              </div>
            ) : (
              <section className="section">
                <div className="card-list" data-grid="true">
                  {postings.map((posting) => (
                    <article className="card" key={posting.id}>
                      <div className="card-head">
                        <LogoTile
                          name={organization.name}
                          type={posting.type as OpportunityType}
                        />
                        <div>
                          <h3 className="t-title card-title">{posting.title}</h3>
                          <p className="t-meta card-org">
                            {posting.minimumAge}+ · {timingPhrase(posting.timing as Timing[])}
                          </p>
                        </div>
                        <span />
                      </div>

                      <div className="meta-row">
                        <TypeBadge type={posting.type as OpportunityType} />
                        <span className="meta-item">
                          {payHeadline(posting.compensation as Compensation)}
                        </span>
                        <span className="meta-item">
                          {STATUS_COPY[posting.status as OpportunityStatus]}
                        </span>
                      </div>

                      <p className="t-body">
                        {posting.interested === 0
                          ? 'Nobody yet — most postings see their first student within a few days.'
                          : `${posting.interested} ${
                              posting.interested === 1 ? 'student is' : 'students are'
                            } interested.`}
                      </p>

                      <Link
                        href={`/employer/opportunity/${posting.id}`}
                        className="btn btn-primary btn-block"
                      >
                        View students
                      </Link>

                      <PostingActions
                        posting={posting}
                        verified={organization.verificationStatus === 'VERIFIED'}
                        setStatus={setStatus}
                      />
                    </article>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </main>

      <div className="sticky-cta">
        <Link href="/employer/post/1" className="btn btn-primary btn-block">
          <Plus />
          Post Opportunity
        </Link>
      </div>
    </div>
  );
}

/* What an employer can do to a posting they already have.
 *
 * Only the three states that are theirs to set appear: a posting waiting on
 * our review has no buttons, because the honest answer there is that it is
 * with us. The server refuses a publish from an unverified organization
 * regardless of what this renders. */
function PostingActions({
  posting,
  verified,
  setStatus,
}: {
  posting: Posting;
  verified: boolean;
  setStatus: (id: string, status: 'PUBLISHED' | 'PAUSED' | 'FILLED') => Promise<string | null>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async (status: 'PUBLISHED' | 'PAUSED' | 'FILLED') => {
    if (busy) return;
    setBusy(true);
    setError(await setStatus(posting.id, status));
    setBusy(false);
  };

  const live = posting.status === 'PUBLISHED';
  const paused = posting.status === 'PAUSED';
  const filled = posting.status === 'FILLED';
  const changeable = live || paused || filled;

  return (
    <div className="stack gap-2">
      <div className="row wrap gap-2">
        <Link
          href={`/employer/opportunity/${posting.id}/edit`}
          className="btn btn-secondary btn-action"
        >
          Edit
        </Link>

        {live ? (
          <button type="button" className="btn btn-secondary btn-action" disabled={busy} onClick={() => void go('PAUSED')}>
            Pause
          </button>
        ) : null}

        {(paused || filled) && changeable ? (
          <button
            type="button"
            className="btn btn-secondary btn-action"
            disabled={busy || !verified}
            onClick={() => void go('PUBLISHED')}
          >
            {filled ? 'Post again' : 'Put back up'}
          </button>
        ) : null}

        {live || paused ? (
          <button type="button" className="btn btn-secondary btn-action" disabled={busy} onClick={() => void go('FILLED')}>
            Mark filled
          </button>
        ) : null}
      </div>

      {(paused || filled) && !verified ? (
        <p className="t-meta">
          We are still checking your organization, so this cannot go back up yet.
        </p>
      ) : null}

      {error ? (
        <p className="t-meta" role="alert" style={{ color: 'var(--warn)' }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/* §30 wants a confirmation that gives the employer immediate value. What it
   says depends on something true: a verified organization's posting is live,
   an unverified one's is queued behind its review. */
function JustPosted({ verified }: { verified: boolean }) {
  const params = useSearchParams();

  /* An edit gets its own confirmation. Saying "you're live" again after a
     price change would be answering a question the employer did not ask. */
  if (params.get('saved') === '1') {
    return (
      <div className="fit">
        <h2 className="fit-heading">Saved</h2>
        <p className="fit-line">Students see the updated posting from now on.</p>
      </div>
    );
  }

  if (params.get('posted') !== '1') return null;

  return (
    <div className="fit">
      <h2 className="fit-heading">{verified ? "You're live" : 'Sent for review'}</h2>
      <p className="fit-line">
        {verified
          ? 'Students nearby can see this now, and it will start showing up in their feed.'
          : 'We check new organizations by hand, usually the same day. The moment you are verified this goes live.'}
      </p>
      <p className="fit-line">You will get an email either way.</p>
    </div>
  );
}
