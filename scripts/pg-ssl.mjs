/* Whether to open a TLS connection, decided from the URL alone.
 *
 * The rule this replaces was "TLS unless the URL says sslmode=disable", which
 * is wrong for the most ordinary case there is: a local Postgres, addressed
 * without any sslmode at all. Homebrew's does not speak TLS, so the scripts
 * failed on `postgres://me@127.0.0.1:5432/teenhire` with "the server does not
 * support SSL connections" — an error that reads like a misconfigured database
 * rather than a bad assumption in the client.
 *
 * Mirrored by sslFor in lib/db.ts, and pinned by tests/pg-ssl.test.ts so the
 * app and the scripts cannot disagree about the same URL. */

const LOCAL = /^(localhost|127\.0\.0\.1|\[?::1\]?|0\.0\.0\.0)$/;

export function sslFor(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    /* Not a URL we can read — let pg decide rather than guessing. */
    return undefined;
  }

  const mode = parsed.searchParams.get('sslmode');
  if (mode === 'disable') return false;

  /* An explicit mode is an instruction, so it wins over any guess about the
     host. verify-ca and verify-full ask for the chain to be checked, and
     silently not checking it would defeat the point of asking. */
  if (mode === 'verify-ca' || mode === 'verify-full') return { rejectUnauthorized: true };
  if (mode) return { rejectUnauthorized: false };

  /* No instruction. A local cluster almost never has TLS; anything else
     almost always requires it, and managed providers commonly present a chain
     Node does not trust on its own. */
  if (LOCAL.test(parsed.hostname)) return false;
  return { rejectUnauthorized: false };
}
