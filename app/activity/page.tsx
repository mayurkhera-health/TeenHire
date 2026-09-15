'use client';

import Link from 'next/link';
import { NavShell, RequireProfile } from '@/components/Shell';
import { DataError, DataLoading } from '@/components/DataError';
import { useOpportunities } from '@/lib/useOpportunities';
import { LogoTile, TypeBadge } from '@/components/ui';
import { postedPhrase } from '@/lib/copy';
import { useApp } from '@/lib/store';
import type { ApplicationStatus, EmployerContact } from '@/lib/types';

/* Status vocabulary a fifteen-year-old can read. No dispositions, no
   requisitions, nothing that reads as having been screened out. */

const STATUS_COPY: Record<ApplicationStatus, { label: string; note: string }> = {
  INTERESTED: { label: 'Interest sent', note: 'Waiting for them to take a look' },
  VIEWED: { label: 'They looked', note: 'Your profile has been opened' },
  EMPLOYER_INTERESTED: { label: 'They want to talk', note: 'Their details are below — you get in touch when you are ready' },
  NOT_SELECTED: { label: 'Went another way', note: 'This one is closed. Plenty more nearby.' },
  WITHDRAWN: { label: 'You withdrew', note: 'No longer being considered' },
  HIRED: { label: 'You got it', note: 'Congratulations — they said yes' },
};

export default function ActivityPage() {
  return (
    <RequireProfile>
      <NavShell>
        <Activity />
      </NavShell>
    </RequireProfile>
  );
}

function Activity() {
  const { profile, applications, withdrawInterest } = useApp();
  const live = applications.filter((a) => a.status !== 'WITHDRAWN');
  const { items, loading, error, reload } = useOpportunities(profile, {
    ids: applications.map((a) => a.opportunityId),
  });
  const byId = new Map(items.map((r) => [r.opportunity.id, r]));

  return (
    <>
      <header className="stack gap-2">
        <h1 className="t-greeting">Activity</h1>
        <p className="t-sub">
          {live.length === 0 ? 'Nothing sent yet' : `${live.length} sent`}
        </p>
      </header>

      {applications.length > 0 && error ? (
        <DataError onRetry={reload} />
      ) : applications.length > 0 && loading ? (
        <DataLoading label="Loading what you sent…" />
      ) : applications.length === 0 ? (
        <div className="panel-ink">
          <h2 className="t-section" style={{ color: '#fff' }}>
            This fills up once you say you're interested
          </h2>
          <p className="t-body">
            You will see here when a place opens your profile and when they reply.
          </p>
          <Link href="/discover" className="btn btn-yellow">
            Find something near me
          </Link>
        </div>
      ) : (
        <div className="card-list">
          {applications.map((application) => {
            const match = byId.get(application.opportunityId);
            if (!match) return null;
            const { opportunity, organization } = match;
            const status = STATUS_COPY[application.status];

            return (
              <article className="card" key={application.opportunityId}>
                <div className="card-head">
                  <LogoTile name={organization.name} type={opportunity.type} />
                  <div>
                    <h2 className="t-title card-title">{opportunity.title}</h2>
                    <p className="t-meta card-org">{organization.name}</p>
                  </div>
                  <span />
                </div>

                <div className="meta-row">
                  <TypeBadge type={opportunity.type} />
                  <span className="meta-item">{postedPhrase(application.createdAt)}</span>
                </div>

                <div className="fit">
                  <h3 className="fit-heading">{status.label}</h3>
                  <p className="fit-line">{status.note}</p>
                </div>

                {application.employer ? <Handoff employer={application.employer} /> : null}

                {application.note ? <p className="t-body">You wrote: “{application.note}”</p> : null}

                <div className="sticky-cta-row">
                  <Link
                    href={`/opportunity/${opportunity.id}`}
                    className="btn btn-secondary"
                    style={{ flex: 1 }}
                  >
                    View
                  </Link>
                  {application.status === 'INTERESTED' ? (
                    <button
                      type="button"
                      className="btn btn-tertiary"
                      onClick={() => withdrawInterest(application.opportunityId)}
                    >
                      Withdraw
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

/* §34, the handoff — and the only screen in the product where a student is
   asked to do something outside it.
 *
 * The details flow one way. The organization never receives a student's
 * address; the student receives the organization's and decides whether to use
 * it, which means a student who changes their mind simply does not call.
 *
 * The suggested opening line is not decoration. Calling a business is hard at
 * sixteen, and "I do not know what to say" is where this otherwise ends. It is
 * written to be said out loud, and it is selectable so it can be pasted into
 * an email instead by anyone who would rather not phone. */
function Handoff({ employer }: { employer: EmployerContact }) {
  const who = employer.contactName.trim();

  return (
    <div className="stack gap-3">
      <div className="stack gap-2">
        <span className="t-mono" style={{ color: 'var(--muted)' }}>
          How to reach them
        </span>
        <p className="t-title">{employer.organizationName}</p>
        {who ? <p className="t-meta">Ask for {who}.</p> : null}

        <div className="stack gap-2">
          {employer.phone ? (
            <a href={`tel:${employer.phone.replace(/[^\d+]/g, '')}`} className="btn btn-primary btn-block">
              Call {employer.phone}
            </a>
          ) : null}
          {employer.email ? (
            <a href={`mailto:${employer.email}`} className="btn btn-secondary btn-block">
              Email {employer.email}
            </a>
          ) : null}
          {employer.website ? (
            <a
              href={employer.website.startsWith('http') ? employer.website : `https://${employer.website}`}
              className="btn btn-tertiary btn-inline"
              target="_blank"
              rel="noreferrer noopener"
            >
              {employer.website}
            </a>
          ) : null}
        </div>
      </div>

      <div className="fit">
        <h4 className="fit-heading">Not sure what to say?</h4>
        <p className="fit-line">
          &ldquo;Hi{who ? `, is ${who} there` : ''}? My name is <strong>[your name]</strong> — I
          applied through TeenHire and I heard you wanted to talk. Is now a good time?&rdquo;
        </p>
        <p className="fit-line">
          They already know who you are. They asked for this conversation.
        </p>
      </div>

      <p className="t-meta">
        They do not have your phone number or your address — only what you saw on the
        interest screen. Reaching out is your call.
      </p>
    </div>
  );
}
