import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  CODE_TTL_MS,
  MAX_ATTEMPTS,
  canResend,
  maskContact,
  normaliseContact,
  resendWaitSeconds,
  stubAuthProvider as auth,
  validateContact,
} from '../lib/auth';

/* These pin the properties that get forgotten when auth is rewritten against
   a real provider: codes expire, codes are single-use, attempts are capped,
   and a spent challenge can never be retried. */

const T0 = 1_700_000_000_000;

const challengeFor = (contact = 'maya@example.com') => {
  const result = auth.requestCode('email', contact, T0);
  assert.ok(result.ok);
  return result.challenge;
};

describe('contact validation', () => {
  it('accepts an ordinary email and a 10-digit number', () => {
    assert.equal(validateContact('email', 'Maya@Example.com '), null);
    assert.equal(validateContact('phone', '(408) 555-0142'), null);
  });

  it('rejects what is obviously not a contact', () => {
    assert.ok(validateContact('email', 'maya'));
    assert.ok(validateContact('phone', '555'));
  });

  it('normalises before storing, so the same person is one account', () => {
    assert.equal(normaliseContact('email', '  Maya@Example.COM '), 'maya@example.com');
    assert.equal(normaliseContact('phone', '(408) 555-0142'), '4085550142');
  });
});

describe('one-time codes', () => {
  it('verifies the right code', () => {
    const challenge = challengeFor();
    const result = auth.verifyCode(challenge, challenge.devCode!, T0 + 1000);
    assert.ok(result.ok);
    assert.equal(result.account.contact, 'maya@example.com');
    assert.ok(result.account.verifiedAt);
  });

  it('refuses a code after it expires', () => {
    const challenge = challengeFor();
    const result = auth.verifyCode(challenge, challenge.devCode!, T0 + CODE_TTL_MS + 1);
    assert.equal(result.ok, false);
    assert.equal(result.challenge, null, 'an expired challenge must be spent, not retryable');
  });

  it('counts down attempts and then burns the challenge', () => {
    let challenge = challengeFor();
    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      const result = auth.verifyCode(challenge, '000000', T0 + 1000);
      assert.equal(result.ok, false);
      assert.ok(result.challenge, `attempt ${i} should leave the challenge alive`);
      challenge = result.challenge;
      assert.equal(challenge.attemptsLeft, MAX_ATTEMPTS - i);
    }
    const last = auth.verifyCode(challenge, '000000', T0 + 1000);
    assert.equal(last.ok, false);
    assert.equal(last.challenge, null, 'the final wrong attempt must spend the challenge');
  });

  /* The one that matters most: a burned challenge must not accept the code
     that was always correct. Otherwise brute force just costs a re-render. */
  it('will not accept the correct code once the challenge is spent', () => {
    let challenge = challengeFor();
    const correct = challenge.devCode!;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const result = auth.verifyCode(challenge, '000000', T0 + 1000);
      assert.equal(result.ok, false, 'a wrong code must never verify');
      if (result.ok) return;
      if (result.challenge) challenge = result.challenge;
      else {
        const after = auth.verifyCode({ ...challenge, attemptsLeft: 0 }, correct, T0 + 1000);
        assert.equal(after.ok, false);
        return;
      }
    }
    assert.fail('challenge was never spent');
  });

  it('issues a different code each time', () => {
    const codes = new Set(Array.from({ length: 40 }, () => challengeFor().devCode));
    assert.ok(codes.size > 35, `codes repeated too often: ${codes.size} distinct of 40`);
  });

  it('will not issue a code to an invalid contact', () => {
    assert.equal(auth.requestCode('phone', '555', T0).ok, false);
  });
});

describe('identity providers', () => {
  it('produces the same kind of account as the code route', () => {
    for (const provider of ['google', 'apple'] as const) {
      const result = auth.signInWithIdentity(provider, T0);
      assert.ok(result.ok);
      assert.equal(result.account.method, provider);
      assert.ok(result.account.contact.includes('@'));
      assert.ok(result.account.verifiedAt, 'an identity sign-in is verified by definition');
    }
  });

  /* Apple's Hide My Email hands back a relay address. Good for a minor, and
     the thing most likely to be broken by code that assumes a real mailbox. */
  it('accepts an Apple private relay address', () => {
    const result = auth.signInWithIdentity('apple', T0);
    assert.ok(result.ok);
    assert.match(result.account.contact, /privaterelay/);
    assert.equal(maskContact(result.account).includes('@'), true);
  });
});

describe('resend cooldown', () => {
  it('allows the first send and then holds for the cooldown', () => {
    assert.equal(canResend(null, T0), true);
    assert.equal(canResend(T0, T0 + 1000), false);
    assert.equal(resendWaitSeconds(T0, T0 + 1000), 29);
    assert.equal(canResend(T0, T0 + 31_000), true);
  });
});

describe('maskContact', () => {
  it('shows enough to recognise and not enough to read over a shoulder', () => {
    assert.equal(maskContact({ method: 'email', contact: 'maya@example.com' }), 'ma••@example.com');
    assert.equal(maskContact({ method: 'phone', contact: '4085550142' }), '••• ••• 0142');
  });
});
