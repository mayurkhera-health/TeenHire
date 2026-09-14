'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { WelcomeBand } from '@/components/WelcomeHero';
import { useApp } from '@/lib/store';

/* Screen 01 — welcome / name capture.
 *
 * One job: take a first name and move into discovery. Three things ship —
 * headline, field, CTA — and nothing else. The dark promo card and the mono
 * eyebrow that used to sit here pushed the button below the fold on a short
 * phone, which is the whole reason this screen was redrawn.
 *
 * The name is optional. A student who does not want to give one gets a
 * generic hello downstream rather than a blocked button, so there is no
 * validation here and no error state to design. */

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
    <div className="welcome">
      <div className="welcome-card">
        <WelcomeBand />

        <div className="welcome-content">
          <div className="welcome-text">
            <h1 className="welcome-headline">Real jobs, close by.</h1>
            <p className="welcome-subhead">
              Paid jobs, internships and volunteering close to home. No résumé, no cover letter —
              about a minute to set up.
            </p>
          </div>

          <div className="welcome-field">
            <label className="welcome-label" htmlFor="first-name">
              Your first name
            </label>
            <input
              id="first-name"
              className="welcome-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') begin();
              }}
              placeholder="Kabir"
              autoCapitalize="words"
              autoComplete="given-name"
              enterKeyHint="go"
              aria-describedby="first-name-helper"
            />
            <p className="welcome-helper" id="first-name-helper">
              Just so the app can say hello. Employers never see it on its own.
            </p>
          </div>

          <button type="button" className="welcome-cta" onClick={begin}>
            Let&rsquo;s go
          </button>

          <p className="welcome-reassurance">Free for under-18s. No résumé needed.</p>
        </div>
      </div>
    </div>
  );
}
