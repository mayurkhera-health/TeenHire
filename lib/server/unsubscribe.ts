import { createHmac, timingSafeEqual } from 'node:crypto';
import { query } from '../db';

/* One-click unsubscribe.
 *
 * The link has to work without a session: it is followed from a mail client,
 * sometimes by the mailbox provider's own robot rather than by the person, and
 * a student who wants these to stop should not have to remember a password
 * first. So the link carries its own proof — the user id plus an HMAC of it —
 * and the only thing that proof authorises is switching notifications off.
 *
 * Signed rather than random so there is no table of tokens to store, expire or
 * leak, and keyed on AUTH_SECRET so a stolen database contains nothing that
 * can be turned into a working link. */

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value && process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SECRET must be set in production');
  }
  return value ?? 'development-only-pepper';
}

export function signatureFor(userId: string): string {
  return createHmac('sha256', secret()).update(`unsubscribe:${userId}`).digest('hex');
}

export function unsubscribeUrl(userId: string, origin: string): string {
  const url = new URL('/unsubscribe', origin.replace(/\/$/, ''));
  url.searchParams.set('u', userId);
  url.searchParams.set('t', signatureFor(userId));
  return url.toString();
}

export function verify(userId: string, token: string): boolean {
  const expected = Buffer.from(signatureFor(userId));
  const given = Buffer.from(token);
  /* Compared in constant time, and only after the lengths match — timingSafeEqual
     throws rather than returns false on a length mismatch, which would itself
     be a signal. */
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/* Deliberately narrow. A valid link switches notifications off and can do
   nothing else: it does not sign anyone in, delete anything, or reveal whether
   the id it names exists. */
export async function unsubscribe(userId: string, token: string): Promise<boolean> {
  if (!verify(userId, token)) return false;
  await query(
    `UPDATE students SET notify_frequency = 'off', updated_at = now() WHERE user_id = $1`,
    [userId],
  );
  return true;
}
