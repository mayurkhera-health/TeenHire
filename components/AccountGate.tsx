'use client';

import { useEffect, useRef, useState } from 'react';
import { Tick } from './Icons';
import { Chip } from './ui';
import {
  CODE_LENGTH,
  IDENTITY_LABEL,
  canResend,
  maskContact,
  resendWaitSeconds,
  stubAuthProvider,
  validateContact,
  type Challenge,
  type ContactMethod,
  type IdentityProvider,
} from '@/lib/auth';
import { useApp } from '@/lib/store';

/* The one wall in the product, and it appears at the only point it is
   earned: something is about to be sent to an adult organization on this
   student's behalf. The copy says so, because a wall that does not explain
   itself is just a wall. */

export function AccountGate({
  organizationName,
  onDone,
}: {
  organizationName: string;
  onDone: () => void;
}) {
  const { signIn } = useApp();
  const [method, setMethod] = useState<ContactMethod>('email');
  const [contact, setContact] = useState('');
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const [, forceTick] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  /* Re-renders once a second only while a cooldown is actually running. */
  useEffect(() => {
    if (lastSentAt === null || canResend(lastSentAt)) return;
    const timer = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [lastSentAt]);

  useEffect(() => {
    if (challenge) codeRef.current?.focus();
  }, [challenge]);

  const send = () => {
    const problem = validateContact(method, contact);
    if (problem) {
      setError(problem);
      return;
    }
    const result = stubAuthProvider.requestCode(method, contact);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setChallenge(result.challenge);
    setLastSentAt(Date.now());
    setCode('');
    setError(null);
  };

  const useIdentity = (provider: IdentityProvider) => {
    const result = stubAuthProvider.signInWithIdentity(provider);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    signIn(result.account);
    onDone();
  };

  const verify = () => {
    if (!challenge) return;
    const result = stubAuthProvider.verifyCode(challenge, code);
    if (result.ok) {
      signIn(result.account);
      onDone();
      return;
    }
    setError(result.error);
    setChallenge(result.challenge);
    setCode('');
    /* A spent challenge drops the student back to the contact step rather
       than leaving them typing into a box that can no longer succeed. */
  };

  if (!challenge) {
    return (
      <>
        <div className="question">
          <h1 className="t-display" style={{ fontSize: 30 }}>
            How should they reach you?
          </h1>
          <p className="t-meta">
            {organizationName} needs one way to get back to you. It is the only thing we ask for,
            and you can delete it whenever you want.
          </p>
        </div>

        {/* The familiar route first, because it is the one people reach for.
            Real integration must use each provider's own button assets and
            follow their branding rules — these are plain until then rather
            than an approximation of a trademark. */}
        <div className="stack gap-2">
          {(['google', 'apple'] as IdentityProvider[]).map((provider) => (
            <button
              key={provider}
              type="button"
              className="btn btn-secondary btn-block"
              onClick={() => useIdentity(provider)}
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
          <Chip
            label="Email"
            selected={method === 'email'}
            onClick={() => {
              setMethod('email');
              setError(null);
            }}
          />
          <Chip
            label="Text message"
            selected={method === 'phone'}
            onClick={() => {
              setMethod('phone');
              setError(null);
            }}
          />
        </div>

        <div className="stack gap-2">
          <label className="t-sub" htmlFor="contact">
            {method === 'email' ? 'Your email' : 'Your mobile number'}
          </label>
          <div className="search">
            <input
              id="contact"
              value={contact}
              onChange={(event) => {
                setContact(event.target.value);
                setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') send();
              }}
              placeholder={method === 'email' ? 'you@example.com' : '(408) 555-0142'}
              type={method === 'email' ? 'email' : 'tel'}
              inputMode={method === 'email' ? 'email' : 'tel'}
              autoComplete={method === 'email' ? 'email' : 'tel'}
              enterKeyHint="send"
            />
          </div>
          {error ? (
            <p className="t-meta" role="alert" style={{ color: 'var(--warn)' }}>
              {error}
            </p>
          ) : null}
        </div>

        <div className="fit">
          <h2 className="fit-heading">No password to make up</h2>
          <p className="fit-line">
            <Tick size={16} />
            We send a six-digit code and you type it back. That is the whole account.
          </p>
          <p className="fit-line">
            <Tick size={16} />
            We never ask for your address or your birthday.
          </p>
        </div>

        <div className="sticky-cta">
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={send}
            disabled={contact.trim().length === 0}
          >
            Send me a code
          </button>
        </div>
      </>
    );
  }

  const waiting = resendWaitSeconds(lastSentAt);

  return (
    <>
      <div className="question">
        <h1 className="t-display" style={{ fontSize: 30 }}>
          Enter the code
        </h1>
        <p className="t-meta">
          Sent to {maskContact(challenge)}. It works for the next ten minutes.
        </p>
      </div>

      <div className="stack gap-2">
        <label className="sr-only" htmlFor="code">
          Six-digit code
        </label>
        <div className="search">
          <input
            id="code"
            ref={codeRef}
            value={code}
            onChange={(event) => {
              setCode(event.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH));
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && code.length === CODE_LENGTH) verify();
            }}
            placeholder="000000"
            inputMode="numeric"
            autoComplete="one-time-code"
            style={{ fontSize: 22, letterSpacing: '0.3em', fontVariantNumeric: 'tabular-nums' }}
          />
        </div>
        {error ? (
          <p className="t-meta" role="alert" style={{ color: 'var(--warn)' }}>
            {error}
          </p>
        ) : null}
      </div>

      {/* Nothing sends a real message in this build, so the prototype has to
          hand the code over. A managed provider never returns the code to the
          client at all — this block is the seam, and it goes with the stub. */}
      {challenge.devCode ? (
        <div className="fit" data-eligible="false">
          <h2 className="fit-heading">Prototype only</h2>
          <p className="fit-line">
            Nothing was actually sent. Your code is{' '}
            <strong style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '0.12em' }}>
              {challenge.devCode}
            </strong>.
          </p>
        </div>
      ) : null}

      <div className="stack gap-2">
        <button
          type="button"
          className="btn btn-tertiary btn-inline"
          onClick={send}
          disabled={!canResend(lastSentAt)}
        >
          {waiting > 0 ? `Send another in ${waiting}s` : 'Send another code'}
        </button>
        <button
          type="button"
          className="btn btn-tertiary btn-inline"
          onClick={() => {
            setChallenge(null);
            setError(null);
            setCode('');
          }}
        >
          Use a different {method === 'email' ? 'email' : 'number'}
        </button>
      </div>

      <div className="sticky-cta">
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={verify}
          disabled={code.length !== CODE_LENGTH}
        >
          Continue
        </button>
      </div>
    </>
  );
}
