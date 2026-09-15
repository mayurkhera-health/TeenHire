import type { OutboundMessage, Provider, SendResult } from './provider';

/* Resend.
 *
 * One file, three lines of interface, no reach beyond this module: nothing
 * above the seam knows email is sent by anyone in particular.
 *
 * Two things here are not optional detail. The first is which failures are
 * worth retrying — a rate limit is a wait, a malformed address never becomes
 * valid, and treating the second like the first is how a queue turns into a
 * backlog. The second is List-Unsubscribe: Gmail and Yahoo require one-click
 * unsubscribe from bulk senders, and mail to teenagers is exactly the mail
 * that should be easy to stop. */

const ENDPOINT = 'https://api.resend.com/emails';

export interface ResendOptions {
  apiKey: string;
  /* "TeenHire <notifications@mail.teenhire.com>". The domain has to be
     verified in Resend or every send is refused. */
  from: string;
  replyTo?: string;
  /* Injected so the adapter is testable without a network or a key. */
  fetchImpl?: typeof fetch;
}

export class ResendProvider implements Provider {
  readonly name = 'resend';

  constructor(private options: ResendOptions) {}

  async send(message: OutboundMessage): Promise<SendResult> {
    if (message.method !== 'email') {
      /* Not retryable, and not an outage: Resend sends email. An SMS that
         reached this adapter is a routing mistake, and retrying it would
         only hide that. */
      return { ok: false, error: 'Resend cannot send SMS', retryable: false };
    }

    const doFetch = this.options.fetchImpl ?? fetch;

    let response: Response;
    try {
      response = await doFetch(ENDPOINT, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: this.options.from,
          to: [message.contact],
          ...(this.options.replyTo ? { reply_to: this.options.replyTo } : {}),
          subject: message.subject,
          text: message.text,
          ...(message.unsubscribeUrl
            ? {
                headers: {
                  'List-Unsubscribe': `<${message.unsubscribeUrl}>`,
                  'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
                },
              }
            : {}),
        }),
      });
    } catch (cause) {
      /* Nothing came back at all — DNS, TLS, a dropped connection. The
         message may or may not have been accepted, which is precisely what
         the unique dedupe key exists to survive. */
      return { ok: false, error: `Network: ${(cause as Error).message}`, retryable: true };
    }

    if (response.ok) {
      const body = (await response.json().catch(() => null)) as { id?: string } | null;
      return { ok: true, providerMessageId: body?.id ?? 'resend-unknown' };
    }

    const detail = await response.text().catch(() => '');
    return {
      ok: false,
      error: `Resend ${response.status}: ${detail.slice(0, 300)}`,
      retryable: retryable(response.status),
    };
  }
}

/* 429 is a rate limit and 5xx is their problem, so both are worth waiting
   out. Everything in the 4xx range is ours: a bad key, an unverified sending
   domain, an address that is not an address. None of those get better by
   being sent again in a minute, and a retry loop on a bad key would burn
   every message in the queue against the attempt limit. */
function retryable(status: number): boolean {
  return status === 429 || status >= 500;
}

export function resendFrom(env: NodeJS.ProcessEnv): ResendProvider {
  const apiKey = env.RESEND_API_KEY;
  const from = env.NOTIFY_FROM;

  /* Named separately so the error says which one is missing. A deploy that
     fails on "RESEND_API_KEY is not set" is fixed in a minute; one that fails
     on "misconfigured" is not. */
  if (!apiKey) throw new Error('NOTIFY_PROVIDER=resend but RESEND_API_KEY is not set');
  if (!from) {
    throw new Error(
      'NOTIFY_PROVIDER=resend but NOTIFY_FROM is not set. It must be an address on a ' +
        'domain verified in Resend, e.g. "TeenHire <notifications@mail.teenhire.com>".',
    );
  }

  return new ResendProvider({ apiKey, from, replyTo: env.NOTIFY_REPLY_TO });
}
