'use client';

import { use, useState } from 'react';

/* The human half of unsubscribe.
 *
 * A GET that switches notifications off on sight looks simpler and is wrong:
 * mail clients and security scanners prefetch links, so the first thing to
 * follow this one is often a robot, and a student would find their
 * notifications off without having touched anything. The page asks; the button
 * POSTs. RFC 8058's one-click path is a POST for the same reason, and mailbox
 * providers only send it when someone presses their own unsubscribe button. */

type State = 'asking' | 'working' | 'done' | 'failed';

export default function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string; t?: string }>;
}) {
  const { u, t } = use(searchParams);
  const [state, setState] = useState<State>('asking');

  const confirm = async () => {
    setState('working');
    const response = await fetch(
      `/api/unsubscribe?u=${encodeURIComponent(u ?? '')}&t=${encodeURIComponent(t ?? '')}`,
      { method: 'POST' },
    );
    setState(response.ok ? 'done' : 'failed');
  };

  return (
    <div className="screen">
      <main className="page gutter">
        <header className="stack gap-2">
          <h1 className="t-greeting">
            {state === 'done' ? "That's done" : 'Stop these emails?'}
          </h1>
          <p className="t-sub">
            {state === 'done'
              ? 'We will not email you about new opportunities again. Everything you have saved or applied to is still there.'
              : state === 'failed'
                ? 'That link did not work. It may have been broken by your mail app — you can turn these off in Settings instead.'
                : 'You will stop hearing about new opportunities near you. Nothing else changes: your saved opportunities and anything you have applied to stay exactly as they are.'}
          </p>
        </header>

        {state === 'asking' || state === 'working' ? (
          <div className="stack gap-3">
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={confirm}
              disabled={state === 'working' || !u || !t}
            >
              {state === 'working' ? 'Turning them off…' : 'Turn them off'}
            </button>
            <a href="/discover" className="btn btn-tertiary btn-inline">
              Keep them, take me back
            </a>
          </div>
        ) : (
          <a href="/discover" className="btn btn-secondary btn-block">
            Back to opportunities
          </a>
        )}

        {state === 'done' ? (
          <p className="t-meta">You can turn them back on any time in Settings.</p>
        ) : null}
      </main>
    </div>
  );
}
