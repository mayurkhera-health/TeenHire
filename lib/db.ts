import { Pool } from 'pg';

/* One pool per process. Nothing here is specific to a hosting provider — the
   app talks to plain Postgres with PostGIS, so where the database lives stays
   a deploy-time decision rather than an architectural one. */

declare global {
  // eslint-disable-next-line no-var
  var __teenhirePool: Pool | undefined;
}

export function getPool(): Pool {
  /* Next reloads modules in development; without this the app opens a new
     pool on every edit until Postgres refuses connections. */
  if (!global.__teenhirePool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set — the app cannot reach its database');
    }
    global.__teenhirePool = new Pool({
      connectionString,
      max: Number(process.env.PGPOOL_MAX ?? 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      /* Managed Postgres almost always requires TLS; a local cluster does not.
         Driven by the URL so neither needs a code change. */
      ssl: sslFor(connectionString),
    });
  }
  return global.__teenhirePool;
}

/* Mirrored in scripts/pg-ssl.mjs, which the migration runner and the database
   check use — they are plain JavaScript so that they run inside the standalone
   image, and cannot import this. tests/pg-ssl.test.ts runs the same cases
   against both, so the app and the scripts cannot disagree about a URL. */
export function sslFor(url: string): false | { rejectUnauthorized: boolean } | undefined {
  /* A Unix socket — Cloud Run to Cloud SQL, or the Cloud SQL Auth Proxy. No
     network, so no TLS. Checked before parsing: an empty authority is not a
     URL new URL() accepts. */
  if (/[?&]host=(%2F|\/)/i.test(url)) return false;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }

  const mode = parsed.searchParams.get('sslmode');
  if (mode === 'disable') return false;
  if (mode === 'verify-ca' || mode === 'verify-full') return { rejectUnauthorized: true };
  if (mode) return { rejectUnauthorized: false };
  if (/^(localhost|127\.0\.0\.1|\[?::1\]?|0\.0\.0\.0)$/.test(parsed.hostname)) return false;
  return { rejectUnauthorized: false };
}

export async function query<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const result = await getPool().query(text, params);
  return result.rows as T[];
}
