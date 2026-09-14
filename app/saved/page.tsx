'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { OpportunityCard } from '@/components/OpportunityCard';
import { NavShell, RequireProfile } from '@/components/Shell';
import { evaluateFit } from '@/lib/matching';
import { useApp } from '@/lib/store';
import type { Ranked } from '@/lib/matching';

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
  const { profile, saved, opportunities, organizations } = useApp();
  const student = profile!;

  /* Saved items are evaluated fresh every time. A student who widens their
     travel range should see a saved listing stop being out of reach. */
  const items = useMemo<Ranked[]>(() => {
    return saved.flatMap((id) => {
      const opportunity = opportunities.find((o) => o.id === id);
      if (!opportunity) return [];
      const organization = organizations.find((o) => o.id === opportunity.organizationId);
      if (!organization) return [];
      return [{ opportunity, organization, fit: evaluateFit(opportunity, organization, student) }];
    });
  }, [saved, opportunities, organizations, student]);

  return (
    <>
      <header className="stack gap-2">
        <h1 className="t-greeting">Saved</h1>
        <p className="t-sub">
          {items.length === 0
            ? 'Nothing saved yet'
            : `${items.length} kept for later`}
        </p>
      </header>

      {items.length === 0 ? (
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
