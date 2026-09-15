import { strict as assert } from 'node:assert';
import { afterEach, describe, it } from 'node:test';
import {
  LogProvider,
  ResendProvider,
  providerFor,
  resendFrom,
  setProvider,
} from '../lib/server/delivery';
import { compose } from '../lib/server/notify';
import { SMS_LIMIT } from '../lib/notifications';
import type { Notification } from '../lib/notifications';

const notification = (over: Partial<Notification> = {}): Notification => ({
  event: 'NEW_MATCH_AVAILABLE',
  channel: 'SMS',
  headline: 'New weekend job 1.2 miles from you',
  detail: 'Smoothie Team Member • 16+ • $17–$19/hr • No experience needed',
  action: 'See it',
  href: '/opportunity/opp-smoothie',
  ...over,
});

afterEach(() => setProvider(null));

describe('the provider seam', () => {
  it('uses the logging provider in development', () => {
    setProvider(null);
    assert.ok(providerFor({ NODE_ENV: 'development' } as NodeJS.ProcessEnv) instanceof LogProvider);
  });

  /* The failure this exists to prevent: shipping with no provider configured,
     where every screen looks fine and no student ever hears anything. It has
     to be loud at startup, like AUTH_SECRET, not silent forever. */
  it('refuses to start in production without a real provider', () => {
    setProvider(null);
    assert.throws(
      () => providerFor({ NODE_ENV: 'production' } as NodeJS.ProcessEnv),
      /never delivered/,
    );
  });

  it('allows production to run deliberately without notifications', () => {
    setProvider(null);
    const provider = providerFor({
      NODE_ENV: 'production',
      NOTIFY_PROVIDER: 'none',
    } as NodeJS.ProcessEnv);
    assert.equal(provider.name, 'none');
  });

  it('refuses a provider name it has no adapter for', () => {
    setProvider(null);
    assert.throws(
      () => providerFor({ NODE_ENV: 'development', NOTIFY_PROVIDER: 'carrier-pigeon' } as NodeJS.ProcessEnv),
      /Unknown NOTIFY_PROVIDER/,
    );
  });

  it('reports a permanent failure as not retryable', async () => {
    setProvider(null);
    const provider = providerFor({ NODE_ENV: 'development', NOTIFY_PROVIDER: 'none' } as NodeJS.ProcessEnv);
    const result = await provider.send({ method: 'email', contact: 'a@b.c', subject: '', text: 'x' });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.retryable, false);
  });
});

describe('compose', () => {
  /* Composition caps an SMS at one segment. Appending a link after the cap is
     exactly how a message that "fits" ends up split across two, so the link is
     part of what gets counted. */
  it('keeps an SMS inside one segment with the link included', () => {
    const message = compose(notification(), 'sms');
    assert.ok(
      message.text.length <= SMS_LIMIT + 'http://localhost:3000/opportunity/opp-smoothie'.length + 1,
      `composed ${message.text.length} chars`,
    );
    assert.match(message.text, /http:\/\/localhost:3000\/opportunity\/opp-smoothie$/);
    assert.equal(message.subject, '');
  });

  it('gives an email a subject and a linked action', () => {
    const message = compose(notification({ channel: 'EMAIL' }), 'email');
    assert.equal(message.subject, 'New weekend job 1.2 miles from you');
    assert.match(message.text, /^Smoothie Team Member/);
    assert.match(message.text, /See it: http:\/\/localhost:3000\/opportunity\/opp-smoothie$/);
  });

  it('builds absolute links from APP_URL, without a doubled slash', () => {
    const saved = process.env.APP_URL;
    process.env.APP_URL = 'https://teenhire.example/';
    try {
      assert.match(compose(notification(), 'email').text, /https:\/\/teenhire\.example\/opportunity\//);
    } finally {
      if (saved === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = saved;
    }
  });
});

describe('the Resend adapter', () => {
  const options = (fetchImpl: typeof fetch) => ({
    apiKey: 'test-key',
    from: 'TeenHire <notifications@mail.teenhire.example>',
    fetchImpl,
  });

  const email = {
    method: 'email' as const,
    contact: 'student@example.com',
    subject: 'New weekend job nearby',
    text: 'Saturday Barista • 16+ • $19–$22/hr',
  };

  const replying = (status: number, body = '{}'): typeof fetch =>
    (async () => new Response(body, { status })) as unknown as typeof fetch;

  it('sends and returns the provider id', async () => {
    const seen: RequestInit[] = [];
    const capture = (async (_url: string, init: RequestInit) => {
      seen.push(init);
      return new Response(JSON.stringify({ id: 'resend-abc' }), { status: 200 });
    }) as unknown as typeof fetch;

    const result = await new ResendProvider(options(capture)).send({
      ...email,
      unsubscribeUrl: 'https://teenhire.example/unsubscribe?u=usr_1&t=deadbeef',
    });

    assert.equal(result.ok, true);
    assert.equal(result.ok === true && result.providerMessageId, 'resend-abc');

    const body = JSON.parse(String(seen[0]?.body));
    assert.deepEqual(body.to, ['student@example.com']);
    assert.equal(body.from, 'TeenHire <notifications@mail.teenhire.example>');
    /* One-click unsubscribe, which Gmail and Yahoo require of bulk senders.
       The angle brackets are part of the header syntax, not decoration. */
    assert.equal(
      body.headers['List-Unsubscribe'],
      '<https://teenhire.example/unsubscribe?u=usr_1&t=deadbeef>',
    );
    assert.equal(body.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  });

  it('omits the unsubscribe headers when there is no link', async () => {
    const seen: RequestInit[] = [];
    const capture = (async (_url: string, init: RequestInit) => {
      seen.push(init);
      return new Response('{"id":"x"}', { status: 200 });
    }) as unknown as typeof fetch;

    await new ResendProvider(options(capture)).send(email);
    assert.equal(JSON.parse(String(seen[0]?.body)).headers, undefined);
  });

  /* The classification that decides whether a queue drains or backs up. A
     rate limit is a wait; a bad key or a malformed address never becomes
     valid, and retrying those burns every message against the attempt limit. */
  it('retries a rate limit and a provider outage', async () => {
    for (const status of [429, 500, 502, 503]) {
      const result = await new ResendProvider(options(replying(status))).send(email);
      assert.equal(result.ok, false);
      assert.equal(result.ok === false && result.retryable, true, `status ${status}`);
    }
  });

  it('does not retry a bad key, a refused sender, or a bad address', async () => {
    for (const status of [401, 403, 422]) {
      const result = await new ResendProvider(options(replying(status))).send(email);
      assert.equal(result.ok, false);
      assert.equal(result.ok === false && result.retryable, false, `status ${status}`);
    }
  });

  it('retries when nothing came back at all', async () => {
    const dead = (async () => {
      throw new Error('ECONNRESET');
    }) as unknown as typeof fetch;
    const result = await new ResendProvider(options(dead)).send(email);
    assert.equal(result.ok === false && result.retryable, true);
    assert.match(result.ok === false ? result.error : '', /ECONNRESET/);
  });

  it('refuses an SMS rather than pretending to send it', async () => {
    const result = await new ResendProvider(options(replying(200))).send({
      ...email,
      method: 'sms',
    });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.retryable, false);
  });

  it('names the missing variable rather than saying it is misconfigured', () => {
    assert.throws(() => resendFrom({ NODE_ENV: 'test', NOTIFY_FROM: 'a@b.c' } as NodeJS.ProcessEnv), /RESEND_API_KEY/);
    assert.throws(() => resendFrom({ NODE_ENV: 'test', RESEND_API_KEY: 'k' } as NodeJS.ProcessEnv), /NOTIFY_FROM/);
  });

  it('is what NOTIFY_PROVIDER=resend selects, in production', () => {
    setProvider(null);
    const provider = providerFor({
      NODE_ENV: 'production',
      NOTIFY_PROVIDER: 'resend',
      RESEND_API_KEY: 'k',
      NOTIFY_FROM: 'TeenHire <a@b.c>',
    } as NodeJS.ProcessEnv);
    assert.equal(provider.name, 'resend');
  });
});
