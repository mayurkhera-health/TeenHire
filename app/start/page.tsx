'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { WelcomeArt } from '@/components/WelcomeHero';
import { useApp } from '@/lib/store';

/* The welcome screen asks for one thing, and it is not an account. There is
   no sign-up wall in front of the product. */

export default function Start() {
  const { ready, profile, draft, setDraft } = useApp();
  const router = useRouter();
  const [name, setName] = useState('');

  useEffect(() => {
    if (ready && profile) router.replace('/discover');
  }, [ready, profile, router]);

  useEffect(() => {
    if (draft.name) setName(draft.name);
  }, [draft.name]);

  const begin = () => {
    setDraft({ name: name.trim() });
    router.push('/onboarding/1');
  };

  return (
    <div className="screen">
      <main className="page gutter" style={{ justifyContent: 'center' }}>
        <WelcomeArt />

        <div className="panel-ink">
          <span className="t-mono" style={{ color: 'var(--yellow)' }}>
            Near you, right now
          </span>
          <h1 className="t-display">What can I do near me?</h1>
          <p className="t-body">
            Paid jobs, internships and volunteering close to home. No résumé, no cover letter, and
            about a minute to set up.
          </p>
        </div>

        <div className="stack gap-3">
          <label className="t-sub" htmlFor="first-name">
            First, what should we call you?
          </label>
          <div className="search">
            <input
              id="first-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your first name"
              autoComplete="given-name"
              enterKeyHint="go"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && name.trim()) begin();
              }}
            />
          </div>
          <p className="t-meta">Just so the app can say hello. Employers never see it on its own.</p>
        </div>
      </main>

      <div className="sticky-cta">
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={begin}
          disabled={name.trim().length === 0}
        >
          Let's go
        </button>
      </div>
    </div>
  );
}
