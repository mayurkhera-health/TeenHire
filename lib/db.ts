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
      ssl: connectionString.includes('sslmode=disable') ? false : undefined,
    });
  }
  return global.__teenhirePool;
}

export async function query<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const result = await getPool().query(text, params);
  return result.rows as T[];
}
