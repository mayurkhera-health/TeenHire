'use client';

/* What a student sees when the database cannot be reached.
 *
 * Deliberately not an empty state. "Nothing near you" is a conclusion about
 * their neighbourhood, and a student who reaches it stops opening the app.
 * A failure is about us, says so, and offers the only useful action. */

export function DataError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="panel-ink">
      <h2 className="t-section" style={{ color: '#fff' }}>
        We couldn&rsquo;t load this
      </h2>
      <p className="t-body">
        Something went wrong on our side — not on yours, and there is nothing wrong with your
        search. Try again in a moment.
      </p>
      <button type="button" className="btn btn-yellow" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

export function DataLoading({ label = 'Finding what’s near you…' }: { label?: string }) {
  return (
    <p className="t-meta" role="status" aria-live="polite">
      {label}
    </p>
  );
}
