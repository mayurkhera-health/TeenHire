'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Shield, Tick } from './Icons';
import { TYPE_BADGE, TYPE_CLASS, initials } from '@/lib/copy';
import type { OpportunityType } from '@/lib/types';

/* ---------- Chip ---------- */
/* One control for filters, availability, interests and transportation.
   Selection shifts weight and adds a tick, so it never rests on colour. */

export function Chip({
  label,
  selected,
  onClick,
  showTick = false,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  showTick?: boolean;
}) {
  return (
    <button type="button" className="chip" aria-pressed={selected} onClick={onClick}>
      {showTick && selected ? <Tick size={15} /> : null}
      {label}
    </button>
  );
}

/* ---------- Answer tile ---------- */

export function Tile({
  label,
  note,
  selected,
  multi = false,
  onClick,
}: {
  label: string;
  note?: string;
  selected: boolean;
  multi?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="tile" aria-pressed={selected} onClick={onClick}>
      <span>
        <span className="tile-label">{label}</span>
        {note ? <span className="tile-note">{note}</span> : null}
      </span>
      {selected ? (
        <Tick size={multi ? 20 : 22} className="tile-tick" />
      ) : null}
    </button>
  );
}

/* ---------- Badges ---------- */

export function TypeBadge({ type }: { type: OpportunityType }) {
  return <span className={`badge ${TYPE_CLASS[type]}`}>{TYPE_BADGE[type]}</span>;
}

export function VerifiedBadge() {
  return (
    <span className="badge badge-verified">
      <Shield />
      Verified
    </span>
  );
}

/* ---------- Progress rail ---------- */
/* Equal bars, one per step. The mono counter appears in the employer flow
   only — a student is not being asked to track how much is left. */

export function ProgressRail({
  step,
  total,
  showCount = false,
}: {
  step: number;
  total: number;
  showCount?: boolean;
}) {
  return (
    <div className="stack gap-2">
      <div
        className="rail"
        role="progressbar"
        aria-valuenow={step}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-label={`Step ${step} of ${total}`}
      >
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className="rail-bar" data-done={i < step} />
        ))}
      </div>
      {showCount ? (
        <span className="t-mono" style={{ color: 'var(--muted)' }}>
          {step} of {total}
        </span>
      ) : null}
    </div>
  );
}

/* ---------- Bottom sheet ---------- */
/* Secondary choices open here. Never a dropdown. */

export function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={panelRef}
      >
        <span className="sheet-handle" />
        <h2 className="t-section">{title}</h2>
        {children}
      </div>
    </>
  );
}

/* ---------- Logo tile ---------- */
/* Where an organization has no mark, a two-letter monogram sits on the
   wash colour of the opportunity type. */

export function LogoTile({
  name,
  type,
  size = 'default',
}: {
  name: string;
  type: OpportunityType;
  size?: 'default' | 'compact';
}) {
  return (
    <span
      className={`logo ${TYPE_CLASS[type]}${size === 'compact' ? ' logo-sm' : ''}`}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

/* ---------- Striped placeholder ---------- */
/* Photography is optional and never load-bearing. Every slot reads
   correctly with no image in it at all. */

export function StripedFill({ type, className }: { type: OpportunityType; className?: string }) {
  return <div className={`stripes ${TYPE_CLASS[type]} ${className ?? ''}`} aria-hidden="true" />;
}
