'use client';

import Link from 'next/link';
import { NavShell, RequireProfile } from '@/components/Shell';
import { LogoTile, TypeBadge } from '@/components/ui';
import { postedPhrase } from '@/lib/copy';
import { useApp } from '@/lib/store';
import type { ApplicationStatus } from '@/lib/types';

/* Status vocabulary a fifteen-year-old can read. No dispositions, no
   requisitions, nothing that reads as having been screened out. */

const STATUS_COPY: Record<ApplicationStatus, { label: string; note: string }> = {
  INTERESTED: { label: 'Interest sent', note: 'Waiting for them to take a look' },
  VIEWED: { label: 'They looked', note: 'Your profile has been opened' },
  EMPLOYER_INTERESTED: { label: 'They want to talk', note: 'Check your email for the next step' },
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
  const { applications, opportunities, organizations, withdrawInterest } = useApp();
  const live = applications.filter((a) => a.status !== 'WITHDRAWN');

  return (
    <>
      <header className="stack gap-2">
        <h1 className="t-greeting">Activity</h1>
        <p className="t-sub">
          {live.length === 0 ? 'Nothing sent yet' : `${live.length} sent`}
        </p>
      </header>

      {applications.length === 0 ? (
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
            const opportunity = opportunities.find((o) => o.id === application.opportunityId);
            if (!opportunity) return null;
            const organization = organizations.find((o) => o.id === opportunity.organizationId);
            if (!organization) return null;
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
