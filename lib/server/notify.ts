import { randomBytes } from 'node:crypto';
import { query } from '../db';
import { SMS_LIMIT, smsText, type Channel, type Notification } from '../notifications';
import { providerFor } from './delivery';
import type { Method, OutboundMessage } from './delivery';

/* Delivery: the part between "we decided to say this" and "somebody's phone
 * buzzed".
 *
 * Composition lives in lib/notifications and is pure — it decides what the
 * words are and whether the student asked to hear them at all. This module
 * decides nothing about content. It resolves where a message can physically
 * go, writes it down before trying, sends it once, and retries only the
 * failures worth retrying. */

const id = () => `nd_${randomBytes(9).toString('base64url')}`;

/* Five attempts over roughly an hour. Past that a message about a weekend
   shift has stopped being news, and a queue that retries forever is a queue
   nobody reads. */
export const MAX_ATTEMPTS = 5;
const BACKOFF_SECONDS = [60, 300, 900, 3600];

function backoff(attempts: number): number {
  return BACKOFF_SECONDS[Math.min(attempts, BACKOFF_SECONDS.length - 1)] ?? 3600;
}

function appUrl(): string {
  return (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

export interface Recipient {
  contact: string;
  method: Method;
}

/* A channel is what the student asked for; a method is what their account can
   actually receive. Someone who signed up with an email address and chose to
   hear "right away" gets an email right away — the frequency is the part they
   expressed a preference about, and silently sending nothing because we hold
   no phone number would be the worst reading of that choice. */
export async function recipientFor(userId: string, channel: Channel): Promise<Recipient | null> {
  const [user] = await query<{ contact: string; contact_method: string }>(
    'SELECT contact, contact_method FROM users WHERE id = $1',
    [userId],
  );
  if (!user) return null;

  const canText = user.contact_method === 'phone';
  return { contact: user.contact, method: channel === 'SMS' && canText ? 'sms' : 'email' };
}

export function compose(notification: Notification, method: Method): OutboundMessage & { contact: '' } {
  const link = `${appUrl()}${notification.href}`;

  if (method === 'sms') {
    /* smsText is capped at one segment by composition, not truncated after
       the fact. The link is added here and counted, because a message that
       fits until you append a URL does not fit. */
    const body = `${smsText(notification)} ${link}`;
    return { method, contact: '', subject: '', text: body };
  }

  return {
    method,
    contact: '',
    subject: notification.headline,
    text: `${notification.detail}\n\n${notification.action}: ${link}`,
  };
}

export interface QueueRequest {
  userId: string;
  notification: Notification;
  /* What makes this message this message. The column is unique, so a repeated
     trigger — a retried job, a double-submitted form, a worker that crashed
     between sending and recording — cannot produce a second copy. The caller
     supplies it because only the caller knows what "the same message" means. */
  dedupeKey: string;
}

export type QueueOutcome =
  | { queued: true; id: string }
  | { queued: false; reason: 'duplicate' | 'no_contact' };

export async function queueNotification(request: QueueRequest): Promise<QueueOutcome> {
  const recipient = await recipientFor(request.userId, request.notification.channel);
  if (!recipient) return { queued: false, reason: 'no_contact' };

  const message = compose(request.notification, recipient.method);
  const rowId = id();

  /* Written before anything is sent. If the process dies mid-send the record
     exists and the worker finishes the job; if it died after sending but
     before recording, the unique key stops the retry becoming a second
     message. */
  const rows = await query<{ id: string }>(
    `INSERT INTO notification_deliveries
       (id, dedupe_key, user_id, event, channel, to_method, to_contact, subject, body)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (dedupe_key) DO NOTHING
     RETURNING id`,
    [
      rowId,
      request.dedupeKey,
      request.userId,
      request.notification.event,
      request.notification.channel,
      recipient.method,
      recipient.contact,
      message.subject,
      message.text,
    ],
  );

  const inserted = rows[0];
  return inserted ? { queued: true, id: inserted.id } : { queued: false, reason: 'duplicate' };
}

interface DueRow {
  id: string;
  to_method: Method;
  to_contact: string;
  subject: string;
  body: string;
  attempts: number;
}

/* One attempt at one message. Separated from the loop so a caller that wants
   a message to go now — a student who just pressed something and is watching
   the screen — does not have to wait for a worker tick. */
export async function attempt(row: DueRow): Promise<'SENT' | 'FAILED' | 'SUPPRESSED'> {
  const provider = providerFor();
  const result = await provider.send({
    method: row.to_method,
    contact: row.to_contact,
    subject: row.subject,
    text: row.body,
  });

  if (result.ok) {
    await query(
      `UPDATE notification_deliveries
       SET status = 'SENT', attempts = attempts + 1, sent_at = now(),
           provider = $2, provider_message_id = $3, last_error = NULL
       WHERE id = $1`,
      [row.id, provider.name, result.providerMessageId],
    );
    return 'SENT';
  }

  const attempts = row.attempts + 1;
  /* A permanent failure and an exhausted one are both SUPPRESSED rather than
     FAILED: FAILED means the worker will come back, and neither of these
     will ever succeed. The error stays on the row so it is possible to tell
     a dead address from a dead provider afterwards. */
  const exhausted = !result.retryable || attempts >= MAX_ATTEMPTS;
  await query(
    `UPDATE notification_deliveries
     SET status = $4, attempts = $2, last_error = $3, provider = $5,
         next_attempt_at = now() + make_interval(secs => $6)
     WHERE id = $1`,
    [row.id, attempts, result.error, exhausted ? 'SUPPRESSED' : 'FAILED', provider.name, backoff(attempts)],
  );
  return exhausted ? 'SUPPRESSED' : 'FAILED';
}

export async function deliverNow(deliveryId: string): Promise<'SENT' | 'FAILED' | 'SUPPRESSED' | 'MISSING'> {
  const [row] = await query<DueRow & { status: string }>(
    `SELECT id, to_method, to_contact, subject, body, attempts, status
     FROM notification_deliveries WHERE id = $1`,
    [deliveryId],
  );
  if (!row || row.status === 'SENT' || row.status === 'SUPPRESSED') return 'MISSING';
  return attempt(row);
}

export interface WorkerResult {
  considered: number;
  sent: number;
  failed: number;
  suppressed: number;
}

/* The worker. Whatever runs it — a cron, a container, a hand-run script —
   calls this and nothing else. It takes only what is due, so running it twice
   at once does redundant work rather than duplicate sends: the send itself is
   guarded by the row, and the row was guarded by the unique key. */
export async function deliverDue(limit = 100): Promise<WorkerResult> {
  const rows = await query<DueRow>(
    `SELECT id, to_method, to_contact, subject, body, attempts
     FROM notification_deliveries
     WHERE status IN ('QUEUED','FAILED') AND next_attempt_at <= now()
     ORDER BY next_attempt_at ASC
     LIMIT $1`,
    [limit],
  );

  const result: WorkerResult = { considered: rows.length, sent: 0, failed: 0, suppressed: 0 };
  for (const row of rows) {
    const outcome = await attempt(row);
    if (outcome === 'SENT') result.sent += 1;
    else if (outcome === 'FAILED') result.failed += 1;
    else result.suppressed += 1;
  }
  return result;
}

export { SMS_LIMIT };
