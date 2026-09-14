'use client';

import Link from 'next/link';
import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LoadingScreen } from '@/components/Shell';
import { Plus } from '@/components/Icons';
import { LogoTile, TypeBadge } from '@/components/ui';
import { payHeadline, timingPhrase } from '@/lib/copy';
import { INTERESTED_STUDENTS, OPPORTUNITIES, ORGANIZATIONS } from '@/lib/data';
import { useApp } from '@/lib/store';
import type { Opportunity, OpportunityStatus } from '@/lib/types';

/* The console answers two questions and no others: what do I have open, and
   who is interested. Students appear as cards here too — the data-dense
   layout this screen is allowed to use stops at the listings. */

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
  const { ready, employerOrg, employerPosts } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (ready && !employerOrg) router.replace('/employer/signup');
  }, [ready, employerOrg, router]);

  if (!ready || !employerOrg) return <LoadingScreen />;

  const samples = OPPORTUNITIES.filter((o) => (INTERESTED_STUDENTS[o.id] ?? []).length > 0);

  return (
    <div className="screen">
      <main className="page gutter console">
        <header className="stack gap-2">
          <span className="t-eyebrow">{employerOrg.name}</span>
          <h1 className="t-greeting">Your opportunities</h1>
        </header>

        <Suspense fallback={null}>
          <JustPosted />
        </Suspense>

        <div className="console-grid">
          <nav className="stack gap-2" aria-label="Console">
            <Link href="/employer" className="btn btn-secondary btn-block">
              Opportunities
            </Link>
            <Link href="/discover" className="btn btn-tertiary">
              See the student view
            </Link>
          </nav>

          <div className="stack gap-5">
            {employerPosts.length === 0 ? (
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
                  {employerPosts.map((opportunity) => (
                    <PostingCard
                      key={opportunity.id}
                      opportunity={opportunity}
                      organizationName={employerOrg.name}
                      interested={0}
                    />
                  ))}
                </div>
              </section>
            )}

            <section className="section">
              <div className="section-head">
                <h2 className="t-section">See how applicants arrive</h2>
              </div>
              <p className="t-meta">
                These are sample listings from other organizations, here so you can see what the
                interested-students view looks like before you have one of your own.
              </p>
              <div className="card-list" data-grid="true">
                {samples.map((opportunity) => (
                  <PostingCard
                    key={opportunity.id}
                    opportunity={opportunity}
                    organizationName={
                      ORGANIZATIONS.find((o) => o.id === opportunity.organizationId)?.name ?? ''
                    }
                    interested={(INTERESTED_STUDENTS[opportunity.id] ?? []).length}
                  />
                ))}
              </div>
            </section>
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

/* §30 wants a confirmation that gives the employer immediate value. It says
   "You're live" — which would be a lie here, because this organization has
   not been verified yet and its posting is queued behind that. The screen
   says what actually happened instead, and says when it changes. */
function JustPosted() {
  const params = useSearchParams();
  if (params.get('posted') !== '1') return null;

  return (
    <div className="fit">
      <h2 className="fit-heading">Sent for review</h2>
      <p className="fit-line">
        We check new organizations by hand, usually the same day. The moment you are verified this
        goes live and students nearby start seeing it.
      </p>
      <p className="fit-line">You will get an email either way.</p>
    </div>
  );
}

function PostingCard({
  opportunity,
  organizationName,
  interested,
}: {
  opportunity: Opportunity;
  organizationName: string;
  interested: number;
}) {
  return (
    <article className="card">
      <div className="card-head">
        <LogoTile name={organizationName} type={opportunity.type} />
        <div>
          <h3 className="t-title card-title">{opportunity.title}</h3>
          <p className="t-meta card-org">
            {opportunity.minimumAge}+ · {timingPhrase(opportunity.timing)}
          </p>
        </div>
        <span />
      </div>

      <div className="meta-row">
        <TypeBadge type={opportunity.type} />
        <span className="meta-item">{payHeadline(opportunity.compensation)}</span>
        <span className="meta-item">{STATUS_COPY[opportunity.status]}</span>
      </div>

      <p className="t-body">
        {interested === 0
          ? 'Nobody yet — most postings see their first student within a few days.'
          : `${interested} ${interested === 1 ? 'student is' : 'students are'} interested.`}
      </p>

      <div className="sticky-cta-row">
        <Link
          href={`/employer/opportunity/${opportunity.id}`}
          className="btn btn-primary"
          style={{ flex: 1 }}
        >
          View students
        </Link>
        <Link href="/employer/post/1" className="btn btn-secondary">
          Edit
        </Link>
      </div>
    </article>
  );
}
