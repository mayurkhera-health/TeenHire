'use client';

import Link from 'next/link';
import { useState } from 'react';
import { DataError, DataLoading } from '@/components/DataError';
import { Plus } from '@/components/Icons';
import { useAdmin, type AdminOrg } from '@/lib/useAdmin';
import type { VerificationStatus } from '@/lib/types';

/* The operations console.
 *
 * Its first job is to give PENDING_REVIEW an exit — until this existed an
 * organization could sign up, post, and wait forever, because nothing in the
 * system could move it. Its second is cold start: an admin can create the
 * organization and the posting on a business's behalf, which is how the first
 * ten pieces of supply actually arrive. */

export default function AdminConsole() {
  const { marketplace, organizations, opportunities, demand, audit, loading, denied, error, reload, verify, setStatus } =
    useAdmin();

  if (loading) {
    return <Shell><DataLoading label="Loading the console…" /></Shell>;
  }
  if (denied) {
    return (
      <Shell>
        <div className="panel-ink">
          <h2 className="t-section" style={{ color: '#fff' }}>Nothing here</h2>
          <p className="t-body">
            This console is for the operations team. If that should be you, your address needs to
            be on the admin list before you sign in.
          </p>
        </div>
      </Shell>
    );
  }
  if (error || !marketplace) {
    return <Shell><DataError onRetry={reload} /></Shell>;
  }

  const pending = organizations.filter(
    (o) => o.verificationStatus === 'PENDING' || o.verificationStatus === 'UNVERIFIED',
  );

  return (
    <Shell>
      <header className="stack gap-2">
        <span className="t-eyebrow">Operations</span>
        <h1 className="t-greeting">Marketplace</h1>
      </header>

      <div className="sticky-cta-row" style={{ flexWrap: 'wrap' }}>
        <Link href="/admin/organizations/new" className="btn btn-primary">
          <Plus />
          Add an organization
        </Link>
        <Link href="/admin/opportunities/new" className="btn btn-secondary">
          Post on their behalf
        </Link>
      </div>

      {/* §39 — supply, demand, activity. The rates matter more than the
          totals: a marketplace with 400 students and no interests is not
          working, and a vanity count hides that. */}
      <section className="section">
        <h2 className="t-section">Supply</h2>
        <div className="admin-grid">
          <Stat figure={marketplace.supply.published} caption="live opportunities" />
          <Stat figure={marketplace.supply.paid} caption="paid jobs" />
          <Stat figure={marketplace.supply.internship} caption="internships" />
          <Stat figure={marketplace.supply.volunteer} caption="volunteer" />
          <Stat figure={marketplace.supply.verifiedOrgs} caption="verified organizations" />
          <Stat figure={marketplace.supply.pendingReview} caption="postings in review" />
        </div>
      </section>

      <section className="section">
        <h2 className="t-section">Demand</h2>
        <div className="admin-grid">
          <Stat figure={marketplace.demand.students} caption="students" />
          {marketplace.demand.byType.map((t) => (
            <Stat key={t.type} figure={t.count} caption={`want ${t.type}`} />
          ))}
        </div>
      </section>

      <section className="section">
        <h2 className="t-section">Liquidity</h2>
        <div className="admin-grid">
          <Stat figure={marketplace.activity.saves} caption="saves" />
          <Stat figure={marketplace.activity.interests} caption="interests sent" />
          <Stat figure={marketplace.activity.employerResponses} caption="employer responses" />
          <Stat
            figure={marketplace.activity.interestRate === null ? '—' : `${marketplace.activity.interestRate}%`}
            caption="interest rate"
          />
          <Stat
            figure={marketplace.activity.responseRate === null ? '—' : `${marketplace.activity.responseRate}%`}
            caption="employer response rate"
          />
          <Stat
            figure={
              marketplace.activity.medianHoursToFirstInterest === null
                ? '—'
                : `${marketplace.activity.medianHoursToFirstInterest}h`
            }
            caption="median time to first interest"
          />
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="t-section">Waiting on you</h2>
        </div>
        {pending.length === 0 ? (
          <p className="t-meta">Nothing in the queue.</p>
        ) : (
          <div className="stack gap-2">
            {pending.map((org) => (
              <VerificationRow key={org.id} org={org} onDecide={verify} />
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="t-section">Opportunities</h2>
        </div>
        <div className="stack gap-2">
          {opportunities.slice(0, 12).map((o) => (
            <div className="admin-row" key={o.id}>
              <div className="who">
                <strong>{o.title}</strong>
                <span className="t-meta">
                  {o.organization} · {o.type} ·{' '}
                  {o.creationMethod === 'ADMIN_ASSISTED' ? 'we posted it' : 'they posted it'} ·{' '}
                  {o.interested} interested
                </span>
              </div>
              <div className="actions">
                <span className={`pill ${statusPill(o.status)}`}>{o.status.replace('_', ' ')}</span>
                {o.status === 'PUBLISHED' ? (
                  <>
                    <button type="button" className="btn btn-secondary" onClick={() => setStatus(o.id, 'PAUSED')}>Pause</button>
                    <button type="button" className="btn btn-secondary" onClick={() => setStatus(o.id, 'FILLED')}>Filled</button>
                  </>
                ) : o.status === 'PAUSED' || o.status === 'PENDING_REVIEW' ? (
                  <button type="button" className="btn btn-primary" onClick={() => setStatus(o.id, 'PUBLISHED')}>Publish</button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* §40–41. Always aggregated, and cells below the floor are withheld
          entirely — in a thin market a cell of one is a named student wearing
          a count. */}
      <section className="section">
        <div className="section-head">
          <h2 className="t-section">Where demand is</h2>
        </div>
        {demand && demand.cells.length > 0 ? (
          <div className="stack gap-2">
            {demand.cells.slice(0, 10).map((cell) => (
              <div className="admin-row" key={`${cell.city}-${cell.ageBand}-${cell.type}-${cell.availability}`}>
                <div className="who">
                  <strong>{cell.city}</strong>
                  <span className="t-meta">
                    Ages {cell.ageBand} · {cell.type} · {cell.availability.replace('_', ' ')}
                  </span>
                </div>
                <span className="pill pill-verified">{cell.students} students</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="t-meta">
            Nothing to show yet. Groups smaller than {demand?.minimumCell ?? 5} students are never
            shown — a cell of one is a student with a count on them.
            {demand && demand.withheld > 0 ? ` ${demand.withheld} groups withheld for that reason.` : ''}
          </p>
        )}
      </section>

      <section className="section">
        <h2 className="t-section">Recent decisions</h2>
        <div className="log">
          {audit.length === 0 ? (
            <span>Nothing yet.</span>
          ) : (
            audit.map((row, index) => (
              <div key={index}>
                <span>{new Date(row.created_at).toLocaleString()}</span>
                <strong style={{ color: 'var(--ink)' }}>{row.actor_label}</strong>
                <span>{row.action}</span>
                <span style={{ fontFamily: 'monospace' }}>{row.subject_id}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="screen">
      <main className="page gutter console" style={{ maxWidth: 'var(--max-console)' }}>
        {children}
      </main>
    </div>
  );
}

function Stat({ figure, caption }: { figure: number | string; caption: string }) {
  return (
    <div className="stat">
      <span className="figure">{figure}</span>
      <span className="caption">{caption}</span>
    </div>
  );
}

function statusPill(status: string): string {
  if (status === 'PUBLISHED') return 'pill-verified';
  if (status === 'PENDING_REVIEW' || status === 'DRAFT') return 'pill-pending';
  return 'pill-stopped';
}

function VerificationRow({
  org,
  onDecide,
}: {
  org: AdminOrg;
  onDecide: (id: string, status: VerificationStatus, note?: string) => Promise<boolean>;
}) {
  const [note, setNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);

  const decide = async (status: VerificationStatus) => {
    setBusy(true);
    await onDecide(org.id, status, note.trim() || undefined);
    setBusy(false);
  };

  return (
    <div className="stack gap-2">
      <div className="admin-row">
        <div className="who">
          <strong>{org.name}</strong>
          <span className="t-meta">
            {org.kind} · {org.city} {org.zip}
            {org.website ? ` · ${org.website}` : ''}
            {org.phone ? ` · ${org.phone}` : ''}
            {org.contactEmail ? ` · ${org.contactEmail}` : ' · no account attached'}
          </span>
          <span className="t-meta">
            {org.openPostings} {org.openPostings === 1 ? 'posting' : 'postings'} waiting on this
          </span>
        </div>
        <div className="actions">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => decide('VERIFIED')}>
            Verify
          </button>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setRejecting((v) => !v)}>
            Reject
          </button>
        </div>
      </div>

      {rejecting ? (
        <div className="panel stack gap-2">
          <label className="t-sub" htmlFor={`note-${org.id}`}>Why? This goes in the record.</label>
          <div className="search">
            <input
              id={`note-${org.id}`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Could not confirm the address"
            />
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy || note.trim().length === 0}
            onClick={() => decide('REJECTED')}
          >
            Reject this organization
          </button>
        </div>
      ) : null}
    </div>
  );
}
