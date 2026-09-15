import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { sslFor } from '../lib/db';
import { sslFor as sslForScripts } from '../scripts/pg-ssl.mjs';

/* One rule, written twice — the app is TypeScript and the migration runner has
 * to be plain JavaScript so it can run inside the standalone image. These
 * cases run against both, so the two cannot drift.
 *
 * The rule they replace was "TLS unless the URL says sslmode=disable", which
 * forced TLS onto a local Postgres addressed without any sslmode and produced
 * "the server does not support SSL connections" — an error that reads like a
 * broken database rather than a wrong assumption in the client. */

const CASES: [string, unknown][] = [
  /* A local cluster, addressed the way anyone would address one. This is the
     case that was broken. */
  ['postgres://me@127.0.0.1:5432/teenhire', false],
  ['postgres://me@localhost:5432/teenhire', false],
  ['postgres://me@[::1]:5432/teenhire', false],

  /* An explicit instruction always wins over any guess about the host. */
  ['postgres://me@127.0.0.1:5432/teenhire?sslmode=disable', false],
  ['postgres://me@db.example.com/teenhire?sslmode=disable', false],
  ['postgres://me@127.0.0.1:5432/teenhire?sslmode=require', { rejectUnauthorized: false }],

  /* Managed Postgres, which commonly presents a chain Node does not trust. */
  ['postgres://me:pw@db.example.com:5432/teenhire', { rejectUnauthorized: false }],
  ['postgres://me:pw@db.example.com:5432/teenhire?sslmode=require', { rejectUnauthorized: false }],

  /* verify-ca and verify-full ask for the chain to be checked. Quietly not
     checking it would defeat the whole point of asking. */
  ['postgres://me@db.example.com/teenhire?sslmode=verify-full', { rejectUnauthorized: true }],
  ['postgres://me@db.example.com/teenhire?sslmode=verify-ca', { rejectUnauthorized: true }],

  /* Unix sockets: Cloud Run to Cloud SQL, and the Cloud SQL Auth Proxy. No
     network to encrypt, and the first of these is not a URL new URL() will
     even parse. */
  ['postgres://me:pw@/teenhire?host=/cloudsql/proj:us-west1:th', false],
  ['postgres://me:pw@localhost/teenhire?host=/cloudsql/proj:us-west1:th', false],
  ['postgres://me:pw@/teenhire?host=%2Fcloudsql%2Fproj%3Aus-west1%3Ath', false],
  ['postgres://me:pw@/teenhire?sslmode=disable&host=/cloudsql/x', false],

  /* Unreadable: hand it to pg rather than guessing. */
  ['not-a-url', undefined],
];

describe('which URLs get TLS', () => {
  for (const [url, expected] of CASES) {
    it(`${url}`, () => {
      assert.deepEqual(sslFor(url), expected);
    });
  }
});

describe('the scripts agree with the app', () => {
  for (const [url] of CASES) {
    it(`${url}`, () => {
      assert.deepEqual(sslForScripts(url), sslFor(url));
    });
  }
});
