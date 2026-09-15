import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { sslFor } from './pg-ssl.mjs';

/* The migration runner.
 *
 * This runs on every deploy, so it has to be safe to run when there is nothing
 * to do. The script it replaces was `for f in db/migrations/*.sql; do psql -f
 * "$f"; done`, which fails on the second run — CREATE TABLE against a table
 * that exists — and so could never have been a release command. It also needed
 * psql, which is not in the runtime image.
 *
 * Plain JavaScript and only `pg`, which the app already depends on, so it runs
 * inside the standalone build with nothing extra installed. */

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(HERE, '..', 'db', 'migrations');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: url,
  ssl: sslFor(url),
});
await client.connect();

await client.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename   text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`);

const applied = new Set(
  (await client.query('SELECT filename FROM schema_migrations')).rows.map((r) => r.filename),
);

/* Lexical order, which is why they are numbered. */
const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();

/* A database that was migrated before this runner existed already has the
   tables but none of the records, so a normal run would try to create them
   again and fail. --baseline records every current migration as applied
   without running any of it.
 
   Deliberately a flag rather than a guess. "The tables look like they are
   already there, so I will assume the rest" is the kind of inference that
   silently skips a migration on a database that was only half migrated. */
if (process.argv.includes('--baseline')) {
  for (const file of files) {
    await client.query(
      'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
      [file],
    );
  }
  console.log(`[migrate] baselined ${files.length} migrations as already applied`);
  await client.end();
  process.exit(0);
}

let ran = 0;
for (const file of files) {
  if (applied.has(file)) continue;

  /* Each migration is one transaction: a file that fails halfway leaves the
     database as it was, and leaves itself unrecorded so the next deploy tries
     again rather than skipping it. */
  await client.query('BEGIN');
  try {
    await client.query(readFileSync(join(MIGRATIONS, file), 'utf8'));
    await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
    await client.query('COMMIT');
    console.log(`[migrate] applied ${file}`);
    ran += 1;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`[migrate] ${file} failed, nothing from it was applied`);
    console.error(error.message);
    await client.end();
    process.exit(1);
  }
}

console.log(ran === 0 ? '[migrate] nothing to do' : `[migrate] ${ran} applied`);
await client.end();
