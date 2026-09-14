'use client';

import Link from 'next/link';
import { OpportunityCard } from '@/components/OpportunityCard';
import { NavShell, RequireProfile } from '@/components/Shell';
import { DataError, DataLoading } from '@/components/DataError';
import { useApp } from '@/lib/store';
import { useOpportunities } from '@/lib/useOpportunities';

export default function SavedPage() {
  return (
    <RequireProfile>
      <NavShell>
        <Saved />
      </NavShell>
    </RequireProfile>
  );
}

function Saved() {
  const { profile, saved } = useApp();
  const student = profile!;

  /* Fetched by id rather than filtered from the feed: a saved opportunity a
     student no longer qualifies for still has to appear, with the reason. It
     is re-evaluated on every load, so widening a travel range brings a saved
     listing back into reach without anything needing to be re-saved. */
  const { items, loading, error, reload } = useOpportunities(student, { ids: saved });

  return (
    <>
      <header className="stack gap-2">
        <h1 className="t-greeting">Saved</h1>
        <p className="t-sub">
          {loading || error
            ? '\u00a0'
            : items.length === 0
              ? 'Nothing saved yet'
              : `${items.length} kept for later`}
        </p>
      </header>

      {error ? (
        <DataError onRetry={reload} />
      ) : loading ? (
        <DataLoading label="Loading what you saved…" />
      ) : items.length === 0 ? (
        <div className="panel-ink">
          <h2 className="t-section" style={{ color: '#fff' }}>
            Tap the heart on anything you like
          </h2>
          <p className="t-body">
            It stays here so you can think about it, show a parent, or come back on the weekend.
          </p>
          <Link href="/discover" className="btn btn-yellow">
            Back to what's near me
          </Link>
        </div>
      ) : (
        <div className="card-list" data-grid="true">
          {items.map((item) => (
            <OpportunityCard key={item.opportunity.id} item={item} />
          ))}
        </div>
      )}
    </>
  );
}
