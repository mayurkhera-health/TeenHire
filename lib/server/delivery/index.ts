import { LogProvider } from './log';
import { resendFrom } from './resend';
import type { Provider } from './provider';

export type { Method, OutboundMessage, Provider, SendResult } from './provider';
export { LogProvider, RecordingProvider } from './log';
export { ResendProvider, resendFrom } from './resend';

/* Which provider this process uses, and the guard that stops the development
 * one reaching production.
 *
 * AUTH_SECRET already works this way: the app refuses to start in production
 * without it rather than falling back to something that happens to run. The
 * same reasoning applies here and is arguably sharper — a missing secret fails
 * loudly on the first request, whereas a logging sender fails silently
 * forever. Students would stop hearing about opportunities and every screen
 * would look fine. */

let current: Provider | null = null;

export function providerFor(env: NodeJS.ProcessEnv = process.env): Provider {
  if (current) return current;

  const chosen = env.NOTIFY_PROVIDER ?? 'log';

  if (chosen === 'log') {
    if (env.NODE_ENV === 'production') {
      throw new Error(
        'NOTIFY_PROVIDER is unset or "log" in production. Messages would be written to ' +
          'the console and never delivered. Set a real provider, or set ' +
          'NOTIFY_PROVIDER=none to run deliberately without notifications.',
      );
    }
    current = new LogProvider();
    return current;
  }

  /* An explicit decision to run without notifications, which is a legitimate
     way to launch. It is not the default, and it has to be typed out, so
     nobody arrives at it by forgetting. */
  if (chosen === 'none') {
    current = {
      name: 'none',
      async send() {
        return { ok: false, error: 'Notifications are switched off', retryable: false };
      },
    };
    return current;
  }

  /* Real providers land here. Each one is a file next to log.ts implementing
     the same three-line interface; nothing above the seam changes. */
  if (chosen === 'resend') {
    current = resendFrom(env);
    return current;
  }

  throw new Error(`Unknown NOTIFY_PROVIDER "${chosen}". Add an adapter in lib/server/delivery.`);
}

/* Tests and the worker replace the provider deliberately rather than by
   setting environment variables halfway through a process. */
export function setProvider(provider: Provider | null): void {
  current = provider;
}
