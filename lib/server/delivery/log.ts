import type { OutboundMessage, Provider, SendResult } from './provider';

/* Development's provider. It writes the message where a developer can read it
 * and reports success, so every path downstream of the seam — the queue, the
 * dedupe key, the retry, the delivery log — runs for real without anything
 * reaching a real person.
 *
 * It is not allowed anywhere near production; see index.ts. A logging sender
 * that silently stands in for a real one is worse than no sender at all,
 * because the product looks like it is working. */
export class LogProvider implements Provider {
  readonly name = 'log';

  private counter = 0;

  async send(message: OutboundMessage): Promise<SendResult> {
    this.counter += 1;
    const id = `log-${Date.now().toString(36)}-${this.counter}`;
    console.log(
      `[notify] ${message.method} → ${message.contact}\n` +
        (message.subject ? `  subject: ${message.subject}\n` : '') +
        message.text
          .split('\n')
          .map((line) => `  ${line}`)
          .join('\n'),
    );
    return { ok: true, providerMessageId: id };
  }
}

/* Used by the tests. Records what it was asked to send and can be told to
   fail, so retry and dedupe are provable rather than assumed. */
export class RecordingProvider implements Provider {
  readonly name = 'recording';

  readonly sent: OutboundMessage[] = [];

  constructor(private behaviour: () => SendResult = () => ({ ok: true, providerMessageId: 'rec-1' })) {}

  async send(message: OutboundMessage): Promise<SendResult> {
    const result = this.behaviour();
    /* Recorded whatever the outcome — a failed attempt still left the
       building as far as the provider is concerned, and a test that only
       counted successes could not tell a retry from a duplicate. */
    this.sent.push(message);
    return result;
  }
}
