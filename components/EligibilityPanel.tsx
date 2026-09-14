import { Dash, Tick } from './Icons';
import type { Fit } from '@/lib/matching';

/* Never a percentage, never a score. Four lines at most, each one produced
   by a rule that actually ran. When a rule the platform can assert fails,
   the panel names that one reason and stops — a student does not need a
   list of everything about them that didn't fit. */

export function EligibilityPanel({ fit }: { fit: Fit }) {
  if (!fit.eligible) {
    return (
      <section className="fit" data-eligible="false">
        <h2 className="fit-heading">This one may not work for you</h2>
        <p className="fit-line">
          <Dash size={16} />
          {fit.blocker}
        </p>
      </section>
    );
  }

  return (
    <section className="fit">
      <h2 className="fit-heading">Looks like a good fit</h2>
      <ul className="stack gap-2">
        {fit.lines.slice(0, 4).map((line) => (
          <li key={line.label} className="fit-line">
            {line.ok ? <Tick size={16} /> : <Dash size={16} />}
            {line.label}
          </li>
        ))}
      </ul>
    </section>
  );
}
