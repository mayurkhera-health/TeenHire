import { strict as assert } from 'node:assert';
import { afterEach, describe, it } from 'node:test';
import { LogProvider, providerFor, setProvider } from '../lib/server/delivery';
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
