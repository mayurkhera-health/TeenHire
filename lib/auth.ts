/* The account gate.
 *
 * A student browses anonymously. An account is created at the moment they
 * first express interest, because that is the first moment identity matters —
 * something is being sent to an adult organization on their behalf, and it
 * has to be revocable, reachable for a reply, and attributable.
 *
 * No passwords. Teenagers reuse weak ones across everything, and a one-time
 * code is both safer and fewer taps than inventing one.
 *
 * ── READ THIS BEFORE LAUNCH ────────────────────────────────────────────────
 * The provider below is a STUB. It runs in the browser, which means the code
 * it checks is sitting in memory next to the check — anyone can read it from
 * devtools. It is a seam, not security. Everything that matters here must be
 * enforced server-side by a managed auth provider: the code is generated and
 * compared on the server, delivered out of band, and never returned to the
 * client. `AuthProvider` is the interface that provider implements; nothing
 * outside this file knows which one is behind it.
 * ───────────────────────────────────────────────────────────────────────────
 */

export type ContactMethod = 'email' | 'phone';

/* The familiar buttons. They are genuinely fewer taps and people expect them.
   Two things to settle before wiring real ones:
   
   1. School accounts. Many districts hand out Google Workspace for Education
      accounts, and a student who signs in with one gives their district admin
      a handle on it and loses it at graduation — along with everything they
      built here. For a product about a student's own independence that is the
      wrong default, which is why the code option stays first-class rather than
      becoming a fallback.
   2. Age. Neither provider reliably returns it, so the age question is still
      ours to ask whichever route they come in through. */
export type IdentityProvider = 'google' | 'apple';

export const IDENTITY_LABEL: Record<IdentityProvider, string> = {
  google: 'Continue with Google',
  apple: 'Continue with Apple',
};

export interface Account {
  id: string;
  method: ContactMethod | IdentityProvider;
  /* The address or number the code went to. Stored because it is how the
     student proves who they are next time, and how we reach them. Never a
     date of birth, never a home address. */
  contact: string;
  createdAt: string;
  verifiedAt: string;
}

export interface Challenge {
  id: string;
  method: ContactMethod;
  contact: string;
  expiresAt: number;
  attemptsLeft: number;
  /* Present only in the stub, so the prototype can show the student a code
     nobody actually sent them. A real provider returns nothing of the sort. */
  devCode?: string;
}

export type RequestResult =
  | { ok: true; challenge: Challenge }
  | { ok: false; error: string };

export type VerifyResult =
  | { ok: true; account: Account }
  | { ok: false; error: string; challenge: Challenge | null };

export interface AuthProvider {
  requestCode(method: ContactMethod, contact: string, now?: number): RequestResult;
  verifyCode(challenge: Challenge, code: string, now?: number): VerifyResult;
  /* Real implementations redirect to the provider and come back with a token
     the SERVER exchanges and verifies. The stub below just returns an
     account, which is exactly the part that must not survive to production. */
  signInWithIdentity(provider: IdentityProvider, now?: number): VerifyResult;
}

export const CODE_LENGTH = 6;
export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const RESEND_COOLDOWN_MS = 30 * 1000;

/* ---------- Contact validation ---------- */

export function normaliseContact(method: ContactMethod, raw: string): string {
  return method === 'email' ? raw.trim().toLowerCase() : raw.replace(/\D/g, '');
}

export function validateContact(method: ContactMethod, raw: string): string | null {
  const value = normaliseContact(method, raw);

  if (method === 'email') {
    /* Deliberately loose. Rejecting an unusual but real address is a worse
       failure than accepting a typo, which the code delivery catches anyway. */
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return 'That does not look like an email address';
    }
    return null;
  }

  if (value.length === 10) return null;
  if (value.length === 11 && value.startsWith('1')) return null;
  return 'Enter a 10-digit mobile number';
}

/* ---------- The stub provider ---------- */

function randomCode(): string {
  const bytes = new Uint32Array(1);
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    crypto.getRandomValues(bytes);
  } else {
    bytes[0] = Math.floor(Math.random() * 0xffffffff);
  }
  return String((bytes[0] ?? 0) % 10 ** CODE_LENGTH).padStart(CODE_LENGTH, '0');
}

function randomId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/* Codes are compared without short-circuiting on the first wrong digit. It
   buys nothing in a browser, and it is the behaviour the server version must
   have — so it is written correctly here rather than being remembered later. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const stubAuthProvider: AuthProvider = {
  requestCode(method, contact, now = Date.now()) {
    const problem = validateContact(method, contact);
    if (problem) return { ok: false, error: problem };

    return {
      ok: true,
      challenge: {
        id: randomId('ch'),
        method,
        contact: normaliseContact(method, contact),
        expiresAt: now + CODE_TTL_MS,
        attemptsLeft: MAX_ATTEMPTS,
        devCode: randomCode(),
      },
    };
  },

  signInWithIdentity(provider, now = Date.now()) {
    const nowIso = new Date(now).toISOString();
    return {
      ok: true,
      account: {
        id: randomId('stu'),
        method: provider,
        contact: IDENTITY_STUB_CONTACT[provider],
        createdAt: nowIso,
        verifiedAt: nowIso,
      },
    };
  },

  verifyCode(challenge, code, now = Date.now()) {
    if (now > challenge.expiresAt) {
      /* An expired challenge is spent. Returning null stops the UI offering
         another attempt against a code that can no longer be right. */
      return { ok: false, error: 'That code has expired — ask for a new one', challenge: null };
    }

    if (challenge.attemptsLeft <= 0) {
      return { ok: false, error: 'Too many tries — ask for a new code', challenge: null };
    }

    const entered = code.replace(/\D/g, '');
    if (!constantTimeEqual(entered, challenge.devCode ?? '')) {
      const attemptsLeft = challenge.attemptsLeft - 1;
      return {
        ok: false,
        error:
          attemptsLeft > 0
            ? `That code is not right — ${attemptsLeft} ${attemptsLeft === 1 ? 'try' : 'tries'} left`
            : 'Too many tries — ask for a new code',
        /* Spent after the last attempt, so a burned challenge can never be
           retried by re-rendering the screen. */
        challenge: attemptsLeft > 0 ? { ...challenge, attemptsLeft } : null,
      };
    }

    const nowIso = new Date(now).toISOString();
    return {
      ok: true,
      account: {
        id: randomId('stu'),
        method: challenge.method,
        contact: challenge.contact,
        createdAt: nowIso,
        verifiedAt: nowIso,
      },
    };
  },
};

/* Apple's Hide My Email gives back a relay address rather than the real one.
   That is a good outcome for a minor, so it is what the stub models. */
const IDENTITY_STUB_CONTACT: Record<IdentityProvider, string> = {
  google: 'maya.student@gmail.example',
  apple: 'k7f2p9qx4m@privaterelay.appleid.example',
};

export function canResend(lastSentAt: number | null, now = Date.now()): boolean {
  return lastSentAt === null || now - lastSentAt >= RESEND_COOLDOWN_MS;
}

export function resendWaitSeconds(lastSentAt: number | null, now = Date.now()): number {
  if (lastSentAt === null) return 0;
  return Math.max(0, Math.ceil((RESEND_COOLDOWN_MS - (now - lastSentAt)) / 1000));
}

/* How the contact is shown back to the student — enough to recognise, not
   enough to be useful to someone reading over their shoulder. */
export function maskContact(account: Pick<Account, 'method' | 'contact'>): string {
  if (account.method === 'phone') {
    return `••• ••• ${account.contact.slice(-4)}`;
  }
  const [user = '', domain = ''] = account.contact.split('@');
  const head = user.slice(0, 2);
  return `${head}${'•'.repeat(Math.max(1, user.length - 2))}@${domain}`;
}
