'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { CompactRow, OpportunityCard } from '@/components/OpportunityCard';
import { NavShell, RequireProfile } from '@/components/Shell';
import { Chip, Sheet } from '@/components/ui';
import { Chevron, Search } from '@/components/Icons';
import { TIMING_LABEL, TYPE_LABEL } from '@/lib/copy';
import { nearbyLine, widenLabel } from '@/lib/greeting';
import { useOpportunities } from '@/lib/useOpportunities';
import { DataError, DataLoading } from '@/components/DataError';
import {
  EMPTY_FILTERS,
  FILTER_TIMING,
  RADIUS_OPTIONS,
  activeFilterCount,
  applyFilters,
  buildSections,
  radiusLabel,
  searchRanked,
  type Filters,
} from '@/lib/sections';
import { useApp } from '@/lib/store';
import type { OpportunityType, Timing } from '@/lib/types';

/* The home screen is a set of answers, not a result set. Search exists, but
   it is the second way in — by the time a student reaches this screen the
   platform already knows roughly what fits them. */

export default function DiscoverPage() {
  return (
    <RequireProfile>
      <NavShell>
        <Discover />
      </NavShell>
    </RequireProfile>
  );
}

function Discover() {
  const { profile, opportunities, organizations, updateProfile } = useApp();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [query, setQuery] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);

  const student = profile!;
  const nextRadius = RADIUS_OPTIONS.find((r) => r > student.radiusMiles) ?? 25;

  /* The feed now comes from Postgres. Eligibility — published, verified, old
     enough, in range — is decided by the query; this screen only presents
     what comes back. */
  const { items: ranked, beyond, loading, error, reload } = useOpportunities(student, {
    beyondRadius: nextRadius,
  });

  const visible = useMemo(
    () => applyFilters(searchRanked(ranked, query), filters),
    [ranked, query, filters],
  );

  const sections = useMemo(
    () => buildSections({ ranked: visible, availability: student.availability }),
    [visible, student.availability],
  );

  const searching = query.trim().length > 0 || activeFilterCount(filters) > 0;

  const nearby = nearbyLine({
    nearby: ranked.length,
    beyond,
    radiusMiles: student.radiusMiles,
    nextRadius,
  });

  /* Widening is the one move that helps in a thin market, so it happens here
     rather than sending a student off to find the radius control themselves. */
  const widen = () => {
    updateProfile({ radiusMiles: nextRadius });
    setFilters(EMPTY_FILTERS);
    setQuery('');
  };

  const toggleType = (type: OpportunityType) =>
    setFilters((f) => ({
      ...f,
      types: f.types.includes(type) ? f.types.filter((t) => t !== type) : [...f.types, type],
    }));

  const toggleTiming = (timing: Timing) =>
    setFilters((f) => ({
      ...f,
      timing: f.timing.includes(timing) ? f.timing.filter((t) => t !== timing) : [...f.timing, timing],
    }));

  return (
    <>
      <header className="stack gap-2">
        <h1 className="t-greeting">Hey {student.name} 👋</h1>
        {/* No count until there is one. A greeting that says "0 near you"
            while the request is still in flight is a lie that arrives first. */}
        <p className="t-sub">{loading || error ? '\u00a0' : nearby.text}</p>
        {!loading && !error && nearby.offerToWiden ? (
          <button type="button" className="btn btn-tertiary btn-inline" onClick={widen}>
            {widenLabel(nextRadius)}
            <Chevron size={16} />
          </button>
        ) : null}
      </header>

      <div className="search">
        <Search />
        <label className="sr-only" htmlFor="feed-search">
          Search places, roles or interests
        </label>
        <input
          id="feed-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search places, roles or interests"
          type="search"
        />
      </div>

      <div className="chip-row">
        <button
          type="button"
          className="chip"
          data-selected={activeFilterCount(filters) > 0}
          onClick={() => setSheetOpen(true)}
        >
          Filters{activeFilterCount(filters) > 0 ? ` · ${activeFilterCount(filters)}` : ''}
        </button>
        {(['paid', 'internship', 'volunteer'] as OpportunityType[]).map((type) => (
          <Chip
            key={type}
            label={TYPE_LABEL[type]}
            selected={filters.types.includes(type)}
            onClick={() => toggleType(type)}
          />
        ))}
      </div>

      {error ? (
        <DataError onRetry={reload} />
      ) : loading ? (
        <DataLoading />
      ) : visible.length === 0 ? (
        <EmptyState
          searching={searching}
          beyond={beyond}
          nextRadius={nextRadius}
          onWiden={widen}
          onClear={() => {
            setFilters(EMPTY_FILTERS);
            setQuery('');
          }}
        />
      ) : searching ? (
        <section className="section">
          <div className="section-head">
            <h2 className="t-section">
              {visible.length} {visible.length === 1 ? 'match' : 'matches'}
            </h2>
          </div>
          <div className="card-list" data-grid="true">
            {visible.map((item) => (
              <OpportunityCard key={item.opportunity.id} item={item} />
            ))}
          </div>
        </section>
      ) : (
        sections.map((section) => {
          const open = expanded.includes(section.id);
          const items = open ? section.allItems : section.items;
          const hidden = section.allItems.length - section.items.length;

          return (
            <section className="section" key={section.id}>
              <div className="section-head">
                <h2 className="t-section">{section.title}</h2>
                {hidden > 0 ? (
                  <button
                    type="button"
                    className="see-all"
                    aria-expanded={open}
                    onClick={() =>
                      setExpanded((current) =>
                        open ? current.filter((id) => id !== section.id) : [...current, section.id],
                      )
                    }
                  >
                    {open ? 'Show fewer' : `See all ${section.allItems.length}`}
                  </button>
                ) : null}
              </div>
              <div className="card-list" data-grid={!section.compact}>
                {items.map((item) =>
                  section.compact ? (
                    <CompactRow key={item.opportunity.id} item={item} />
                  ) : (
                    <OpportunityCard key={item.opportunity.id} item={item} />
                  ),
                )}
              </div>
            </section>
          );
        })
      )}

      <Sheet open={sheetOpen} title="Filters" onClose={() => setSheetOpen(false)}>
        <div className="stack gap-3">
          <h3 className="t-sub">How far</h3>
          <div className="chip-wrap">
            {RADIUS_OPTIONS.map((miles) => (
              <Chip
                key={miles}
                label={radiusLabel(miles)}
                selected={filters.radius === miles}
                onClick={() =>
                  setFilters((f) => ({ ...f, radius: f.radius === miles ? null : miles }))
                }
              />
            ))}
          </div>
        </div>

        <div className="stack gap-3">
          <h3 className="t-sub">When</h3>
          <div className="chip-wrap">
            {FILTER_TIMING.map((timing) => (
              <Chip
                key={timing}
                label={TIMING_LABEL[timing]}
                selected={filters.timing.includes(timing)}
                showTick
                onClick={() => toggleTiming(timing)}
              />
            ))}
          </div>
        </div>

        <p className="t-meta">
          Your age is already set from your profile, so everything here is something you can do.
        </p>

        <div className="stack gap-2">
          <button type="button" className="btn btn-primary btn-block" onClick={() => setSheetOpen(false)}>
            Show {applyFilters(searchRanked(ranked, query), filters).length} opportunities
          </button>
          <button type="button" className="btn btn-tertiary" onClick={() => setFilters(EMPTY_FILTERS)}>
            Clear filters
          </button>
        </div>
      </Sheet>
    </>
  );
}

/* An empty state is a next step with a number attached. It is never the
   words "No results found". */

function EmptyState({
  searching,
  beyond,
  nextRadius,
  onWiden,
  onClear,
}: {
  searching: boolean;
  beyond: number;
  nextRadius: number;
  onWiden: () => void;
  onClear: () => void;
}) {
  if (searching) {
    return (
      <div className="panel-ink">
        <h2 className="t-section" style={{ color: '#fff' }}>
          Nothing matches all of that
        </h2>
        <p className="t-body">Loosen one thing and the list usually fills back up.</p>
        <button type="button" className="btn btn-yellow" onClick={onClear}>
          Clear what I picked
        </button>
      </div>
    );
  }

  return (
    <div className="panel-ink">
      <h2 className="t-section" style={{ color: '#fff' }}>
        Nothing this close yet
      </h2>
      <p className="t-body">
        {beyond > 0
          ? `We found ${beyond} more within ${radiusLabel(nextRadius).toLowerCase()}.`
          : 'New opportunities land every week, and we will tell you when one does.'}
      </p>
      {beyond > 0 ? (
        <button type="button" className="btn btn-yellow" onClick={onWiden}>
          Look {radiusLabel(nextRadius).toLowerCase()} out
        </button>
      ) : (
        <Link href="/me" className="btn btn-yellow">
          Change what I'm looking for
        </Link>
      )}
    </div>
  );
}
