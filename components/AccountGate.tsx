'use client';

import { useEffect, useRef, useState } from 'react';
import { Tick } from './Icons';
import { Chip } from './ui';
import { CODE_LENGTH, IDENTITY_LABEL, validateContact, type ContactMethod, type IdentityProvider } from '@/lib/auth';
import { useApp } from '@/lib/store';

/* The one wall in the product, and it appears at the only point it is earned:
   something is about to be sent to an adult organization on this student's
   behalf.

   The code is now generated, stored hashed and compared on the server. This
   component never sees it — it sends what the student typed and is told yes
   or no. */

export function AccountGate({
  organizationName,
  onDone,
}: {
  organizationName?: string;
  onDone: () => void;
}) {
  const { refreshAccount } = useApp();
  const [method, setMethod] = useState<ContactMethod>('email');
  const [contact, setContact] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [maskedContact, setMaskedContact] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    if (challengeId) codeRef.current?.focus();
  }, [challengeId]);

  const send = async () => {
    const problem = validateContact(method, contact);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);

    const response = await fetch('/api/auth/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ method, contact }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      challengeId?: string;
      devCode?: string;
      error?: string;
      retryAfterSeconds?: number;
    };
    setBusy(false);

    if (!response.ok || !data.challengeId) {
      setError(data.error ?? 'Could not send a code');
      if (data.retryAfterSeconds) setCooldown(data.retryAfterSeconds);
      return;
    }

    setChallengeId(data.challengeId);
    setMaskedContact(mask(method, contact));
    setDevCode(data.devCode ?? null);
    setCooldown(30);
    setCode('');
  };

  const verify = async () => {
    if (!challengeId || busy) return;
    setBusy(true);
    setError(null);

    const response = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ challengeId, code }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      attemptsLeft?: number;
    };
    setBusy(false);

    if (!response.ok || !data.ok) {
      setError(data.error ?? 'That code is not right');
      setCode('');
      /* A spent challenge drops the student back to the contact step rather
         than leaving them typing into a box that can no longer succeed. */
      if (data.attemptsLeft === 0) {
        setChallengeId(null);
        setDevCode(null);
      }
      return;
    }

    await refreshAccount();
    onDone();
  };

  if (!challengeId) {
    return (
      <>
        <div className="question">
          <h1 className="t-display" style={{ fontSize: 30 }}>
            How should they reach you?
          </h1>
          <p className="t-meta">
            {organizationName
              ? `${organizationName} needs one way to get back to you.`
              : 'We need one way to get back to you.'}{' '}
            It is the only thing we ask for, and you can delete it whenever you want.
          </p>
        </div>

        {/* Real integration must use each provider's own button assets and
            follow their branding rules — these stay plain until then rather
            than approximating a trademark. */}
        <div className="stack gap-2">
          {(['google', 'apple'] as IdentityProvider[]).map((provider) => (
            <button
              key={provider}
              type="button"
              className="btn btn-secondary btn-block"
              onClick={() => setError('Google and Apple sign-in arrive with the hosted provider. Use a code for now.')}
            >
              {IDENTITY_LABEL[provider]}
            </button>
          ))}
          <p className="t-meta">
            Use a personal account if you have one. A school account can be turned off by your
            district, and you lose it when you graduate.
          </p>
        </div>

        <div className="row gap-3">
          <hr className="divider" style={{ flex: 1 }} />
          <span className="t-eyebrow">or</span>
          <hr className="divider" style={{ flex: 1 }} />
        </div>

        <div className="chip-wrap">
          <Chip label="Email" selected={method === 'email'} onClick={() => { setMethod('email'); setError(null); }} />
          <Chip label="Text message" selected={method === 'phone'} onClick={() => { setMethod('phone'); setError(null); }} />
        </div>

        <div className="stack gap-2">
          <label className="t-sub" htmlFor="contact">
            {method === 'email' ? 'Your email' : 'Your mobile number'}
          </label>
          <div className="search">
            <input
              id="contact"
              value={contact}
              onChange={(event) => { setContact(event.target.value); setError(null); }}
              onKeyDown={(event) => { if (event.key === 'Enter') void send(); }}
              placeholder={method === 'email' ? 'you@example.com' : '(408) 555-0142'}
              type={method === 'email' ? 'email' : 'tel'}
              inputMode={method === 'email' ? 'email' : 'tel'}
              autoComplete={method === 'email' ? 'email' : 'tel'}
              enterKeyHint="send"
            />
          </div>
          {error ? <p className="t-meta" role="alert" style={{ color: 'var(--warn)' }}>{error}</p> : null}
        </div>

        <div className="fit">
          <h2 className="fit-heading">No password to make up</h2>
          <p className="fit-line"><Tick size={16} />We send a six-digit code and you type it back. That is the whole account.</p>
          <p className="fit-line"><Tick size={16} />We never ask for your address or your birthday.</p>
        </div>

        <div className="sticky-cta">
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={send}
            disabled={contact.trim().length === 0 || busy}
          >
            {busy ? 'Sending…' : 'Send me a code'}
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="question">
        <h1 className="t-display" style={{ fontSize: 30 }}>Enter the code</h1>
        <p className="t-meta">Sent to {maskedContact}. It works for the next ten minutes.</p>
      </div>

      <div className="stack gap-2">
        <label className="sr-only" htmlFor="code">Six-digit code</label>
        <div className="search">
          <input
            id="code"
            ref={codeRef}
            value={code}
            onChange={(event) => { setCode(event.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH)); setError(null); }}
            onKeyDown={(event) => { if (event.key === 'Enter' && code.length === CODE_LENGTH) void verify(); }}
            placeholder="000000"
            inputMode="numeric"
            autoComplete="one-time-code"
            style={{ fontSize: 22, letterSpacing: '0.3em', fontVariantNumeric: 'tabular-nums' }}
          />
        </div>
        {error ? <p className="t-meta" role="alert" style={{ color: 'var(--warn)' }}>{error}</p> : null}
      </div>

      {/* Only rendered when AUTH_DEV_CODES is set and the build is not a
          production one, which is also why the journey test runs against a dev
          server: a production build has no way in and should have none. */}
      {devCode ? (
        <div className="fit" data-eligible="false">
          <h2 className="fit-heading">Development only</h2>
          <p className="fit-line">
            No message was sent. Your code is{' '}
            <strong style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '0.12em' }}>{devCode}</strong>.
          </p>
        </div>
      ) : (
        <p className="t-meta">Check your {method === 'email' ? 'inbox' : 'messages'}.</p>
      )}

      <div className="stack gap-2">
        <button type="button" className="btn btn-tertiary btn-inline" onClick={send} disabled={cooldown > 0 || busy}>
          {cooldown > 0 ? `Send another in ${cooldown}s` : 'Send another code'}
        </button>
        <button
          type="button"
          className="btn btn-tertiary btn-inline"
          onClick={() => { setChallengeId(null); setError(null); setCode(''); setDevCode(null); }}
        >
          Use a different {method === 'email' ? 'email' : 'number'}
        </button>
      </div>

      <div className="sticky-cta">
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={verify}
          disabled={code.length !== CODE_LENGTH || busy}
        >
          {busy ? 'Checking…' : 'Continue'}
        </button>
      </div>
    </>
  );
}

function mask(method: ContactMethod, contact: string): string {
  if (method === 'phone') {
    const digits = contact.replace(/\D/g, '');
    return `••• ••• ${digits.slice(-4)}`;
  }
  const [user = '', domain = ''] = contact.trim().toLowerCase().split('@');
  return `${user.slice(0, 2)}${'•'.repeat(Math.max(1, user.length - 2))}@${domain}`;
}
