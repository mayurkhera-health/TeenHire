'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Cake, Clock, Dash, Heart, Pin, Spark, Tick } from './Icons';
import { LogoTile, TypeBadge } from './ui';
import { MoneyBlock } from './MoneyBlock';
import { EXPERIENCE_LABEL, timingPhrase } from '@/lib/copy';
import { formatDistance } from '@/lib/geo';
import { useApp } from '@/lib/store';
import type { Ranked } from '@/lib/matching';

/* The single most important component. Slot order is fixed: logo, title,
   org, money, meta, one line of reassurance, the button. No job description
   ever lands on a card — that is what the detail screen is for. */

export function OpportunityCard({ item }: { item: Ranked }) {
  const { opportunity, organization, fit } = item;
  const { isSaved, toggleSaved } = useApp();
  const saved = isSaved(opportunity.id);

  return (
    <article className="card">
      <div className="card-head">
        <LogoTile name={organization.name} type={opportunity.type} />
        <div>
          <h3 className="t-title card-title">{opportunity.title}</h3>
          <p className="t-meta card-org">
            {organization.name} · {organization.location.city}
          </p>
        </div>
        <button
          type="button"
          className="heart"
          data-saved={saved}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${opportunity.title} from saved` : `Save ${opportunity.title}`}
          onClick={() => toggleSaved(opportunity.id)}
        >
          <Heart filled={saved} />
        </button>
      </div>

      <MoneyBlock
        compensation={opportunity.compensation}
        timing={opportunity.timing}
        hours={opportunity.hours}
      />

      <div className="meta-row">
        <TypeBadge type={opportunity.type} />
        <span className="meta-item">
          <Pin />
          {formatDistance(fit.distance)}
        </span>
        <span className="meta-item">
          <Cake />
          {opportunity.minimumAge}+
        </span>
        <span className="meta-item">
          <Clock />
          {timingPhrase(opportunity.timing)}
        </span>
      </div>

      {/* A card in the feed is always eligible, but a saved one may have
          stopped being so — the card says which rather than leaving a student
          to work it out from a screen they reached three days ago. */}
      <p className="meta-item" style={{ color: fit.eligible ? 'var(--teal)' : 'var(--warn)' }}>
        {fit.eligible ? <Tick size={15} /> : <Dash size={15} />}
        {fit.eligible ? 'You can apply' : fit.blocker}
      </p>

      <p className="t-body">{opportunity.reassurance}</p>

      <Link href={`/opportunity/${opportunity.id}`} className="btn btn-primary btn-block">
        View
      </Link>
    </article>
  );
}

/* The compact variant: whole row is the target, no button competing with
   it. Used for secondary sections and for volunteer listings. */

export function CompactRow({ item }: { item: Ranked }) {
  const { opportunity, organization, fit } = item;
  const router = useRouter();

  const meta =
    opportunity.type === 'volunteer'
      ? `${formatDistance(fit.distance)} · ${timingPhrase(opportunity.timing)}`
      : `${organization.name} · ${formatDistance(fit.distance)}`;

  return (
    <button
      type="button"
      className="row-card pressable"
      onClick={() => router.push(`/opportunity/${opportunity.id}`)}
    >
      <LogoTile name={organization.name} type={opportunity.type} size="compact" />
      <span className="stack gap-1" style={{ minWidth: 0 }}>
        <span className="t-title card-title">{opportunity.title}</span>
        <span className="t-meta">{meta}</span>
      </span>
      <span className="meta-item">
        <Spark />
        {opportunity.minimumAge}+
      </span>
    </button>
  );
}

export function ExperienceNote({ experience }: { experience: Ranked['opportunity']['experience'] }) {
  return (
    <span className="meta-item">
      <Spark />
      {EXPERIENCE_LABEL[experience]}
    </span>
  );
}
