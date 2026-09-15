import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { query } from '../db';
import { CODE_TTL_MS, MAX_ATTEMPTS, RESEND_COOLDOWN_MS, normaliseContact, validateContact } from '../auth';
import type { ContactMethod } from '../auth';

/* Server-side authentication.
 *
 * This replaces the browser stub. The difference that matters: the code is
 * generated here, hashed before storage, and never returned to the client in
 * production. A database dump hands nobody a working login, and a student's
 * devtools show them nothing they did not already receive.
 *
 * Still no passwords. A one-time code is safer than anything a sixteen-year-old
 * will invent and reuse, and it is fewer taps. */

const SESSION_TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60 days
export const SESSION_COOKIE = 'th_session';

/* A pepper means a stolen database still cannot be brute-forced offline
   against a six-digit space, which is small enough to exhaust instantly. */
function pepper(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SECRET must be set in production');
  }
  return secret ?? 'development-only-pepper';
}

/* Nobody signs up to be an admin. The role comes from an allow-list held in
   the environment and from nowhere else — a self-service path to admin would
   be a hole in the one part of this product that exists to keep minors safe. */
export function isAdminContact(contact: string): boolean {
  return (process.env.ADMIN_CONTACTS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .includes(contact.toLowerCase());
}

const hash = (value: string) => createHash('sha256').update(`${pepper()}:${value}`).digest('hex');
const id = (prefix: string) => `${prefix}_${randomBytes(9).toString('base64url')}`;

function sixDigits(): string {
  /* Rejection-free and unbiased enough for six digits: take 4 bytes, reduce.
     The bias across 10^6 from 2^32 is under one part in four thousand. */
  return String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, '0');
}

export type RequestOutcome =
  | { ok: true; challengeId: string; devCode?: string }
  | { ok: false; error: string; retryAfterSeconds?: number };

export async function requestCode(
  method: ContactMethod,
  rawContact: string,
): Promise<RequestOutcome> {
  const problem = validateContact(method, rawContact);
  if (problem) return { ok: false, error: problem };

  const contact = normaliseContact(method, rawContact);

  /* The cooldown is enforced here rather than in the component. A client-side
     timer stops an honest student double-tapping; it stops nobody else. */
  const [recent] = await query<{ created_at: Date }>(
    `SELECT created_at FROM auth_challenges
     WHERE contact = $1 ORDER BY created_at DESC LIMIT 1`,
    [contact],
  );
  if (recent) {
    const elapsed = Date.now() - new Date(recent.created_at).getTime();
    if (elapsed < RESEND_COOLDOWN_MS) {
      return {
        ok: false,
        error: 'A code was just sent — give it a moment',
        retryAfterSeconds: Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000),
      };
    }
  }

  /* Any earlier live challenge for this contact is spent. Two valid codes at
     once doubles the guessing surface for no benefit. */
  await query(
    `UPDATE auth_challenges SET consumed_at = now()
     WHERE contact = $1 AND consumed_at IS NULL`,
    [contact],
  );

  const code = sixDigits();
  const challengeId = id('ch');
  await query(
    `INSERT INTO auth_challenges (id, contact, contact_method, code_hash, expires_at, attempts_left)
     VALUES ($1,$2,$3,$4, now() + ($5 || ' milliseconds')::interval, $6)`,
    [challengeId, contact, method, hash(code), String(CODE_TTL_MS), MAX_ATTEMPTS],
  );

  /* Delivery arrives in Phase 4. Until then the code is logged server-side,
     and only handed back when a developer has explicitly asked for it. */
  console.info(`[auth] code for ${contact}: ${code}`);
  const exposeCode = process.env.AUTH_DEV_CODES === '1' && process.env.NODE_ENV !== 'production';

  return { ok: true, challengeId, ...(exposeCode ? { devCode: code } : {}) };
}

export type VerifyOutcome =
  | { ok: true; userId: string; token: string; isNew: boolean }
  | { ok: false; error: string; attemptsLeft: number };

export async function verifyCode(challengeId: string, submitted: string): Promise<VerifyOutcome> {
  const [challenge] = await query<{
    id: string;
    contact: string;
    contact_method: ContactMethod;
    code_hash: string;
    attempts_left: number;
    expired: boolean;
    consumed: boolean;
  }>(
    `SELECT id, contact, contact_method, code_hash, attempts_left,
            (expires_at < now()) AS expired,
            (consumed_at IS NOT NULL) AS consumed
     FROM auth_challenges WHERE id = $1`,
    [challengeId],
  );

  if (!challenge || challenge.consumed) {
    return { ok: false, error: 'Ask for a new code', attemptsLeft: 0 };
  }
  if (challenge.expired) {
    await query('UPDATE auth_challenges SET consumed_at = now() WHERE id = $1', [challengeId]);
    return { ok: false, error: 'That code has expired — ask for a new one', attemptsLeft: 0 };
  }
  if (challenge.attempts_left <= 0) {
    await query('UPDATE auth_challenges SET consumed_at = now() WHERE id = $1', [challengeId]);
    return { ok: false, error: 'Too many tries — ask for a new code', attemptsLeft: 0 };
  }

  const entered = submitted.replace(/\D/g, '');
  const expected = Buffer.from(challenge.code_hash, 'hex');
  const actual = Buffer.from(hash(entered), 'hex');
  const matches = expected.length === actual.length && timingSafeEqual(expected, actual);

  if (!matches) {
    const [row] = await query<{ attempts_left: number }>(
      `UPDATE auth_challenges
       SET attempts_left = attempts_left - 1,
           consumed_at = CASE WHEN attempts_left - 1 <= 0 THEN now() ELSE NULL END
       WHERE id = $1 RETURNING attempts_left`,
      [challengeId],
    );
    const left = row?.attempts_left ?? 0;
    return {
      ok: false,
      error:
        left > 0
          ? `That code is not right — ${left} ${left === 1 ? 'try' : 'tries'} left`
          : 'Too many tries — ask for a new code',
      attemptsLeft: left,
    };
  }

  await query('UPDATE auth_challenges SET consumed_at = now() WHERE id = $1', [challengeId]);

  const { userId, isNew } = await upsertUser(challenge.contact, challenge.contact_method);
  const token = await issueSession(userId);
  return { ok: true, userId, token, isNew };
}

async function upsertUser(
  contact: string,
  method: ContactMethod,
): Promise<{ userId: string; isNew: boolean }> {
  const role = isAdminContact(contact) ? 'admin' : 'student';

  const [existing] = await query<{ id: string }>('SELECT id FROM users WHERE contact = $1', [contact]);
  if (existing) {
    /* An address added to the allow-list takes effect on the next sign-in;
       one removed from it loses the role the same way. */
    await query(
      `UPDATE users SET verified_at = now(),
         role = CASE WHEN $2 = 'admin' THEN 'admin'
                     WHEN role = 'admin' THEN 'student'
                     ELSE role END
       WHERE id = $1`,
      [existing.id, role],
    );
    return { userId: existing.id, isNew: false };
  }

  const userId = id('usr');
  await query(
    `INSERT INTO users (id, contact, contact_method, role, verified_at)
     VALUES ($1,$2,$3,$4, now())`,
    [userId, contact, method, role],
  );
  return { userId, isNew: true };
}

export async function issueSession(userId: string): Promise<string> {
  /* The cookie holds the secret; the database holds only its hash. Signing out
     deletes a row, which is the whole reason sessions are rows and not
     self-contained tokens. */
  const token = randomBytes(32).toString('base64url');
  await query(
    `INSERT INTO sessions (token_hash, user_id, expires_at)
     VALUES ($1,$2, now() + ($3 || ' milliseconds')::interval)`,
    [hash(token), userId, String(SESSION_TTL_MS)],
  );
  return token;
}

export interface SessionUser {
  id: string;
  contact: string;
  contactMethod: string;
  role: 'student' | 'org' | 'admin';
}

export async function userForToken(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const [row] = await query<{
    id: string;
    contact: string;
    contact_method: string;
    role: SessionUser['role'];
  }>(
    `SELECT u.id, u.contact, u.contact_method, u.role
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()`,
    [hash(token)],
  );
  return row
    ? { id: row.id, contact: row.contact, contactMethod: row.contact_method, role: row.role }
    : null;
}

export async function revokeSession(token: string | undefined): Promise<void> {
  if (!token) return;
  await query('UPDATE sessions SET revoked_at = now() WHERE token_hash = $1', [hash(token)]);
}

export const SESSION_MAX_AGE_SECONDS = Math.floor(SESSION_TTL_MS / 1000);
