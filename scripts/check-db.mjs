import pg from 'pg';
import { sslFor } from './pg-ssl.mjs';

/* Is this database one the app can actually run on?
 *
 * Every page runs a PostGIS query — distance, radius, the eligibility gate —
 * so a Postgres without PostGIS is not a slower TeenHire, it is a TeenHire
 * where nothing works. Managed providers differ on whether the extension is
 * available at all and on whether your role is allowed to create it, and the
 * failure arrives during the first deploy's migration otherwise.
 *
 *   DATABASE_URL="postgres://..." npm run db:check
 *
 * Read-only apart from one CREATE EXTENSION attempt, which is rolled back. */

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

let problems = 0;
const ok = (line) => console.log(`ok   ${line}`);
const bad = (line, fix) => { problems++; console.log(`NO   ${line}`); if (fix) console.log(`     → ${fix}`); };

const client = new pg.Client({
  connectionString: url,
  ssl: sslFor(url),
  connectionTimeoutMillis: 10_000,
});

try {
  await client.connect();
} catch (error) {
  console.error(`NO   cannot connect: ${error.message}`);
  console.error('     → check the host, the password, and whether the database allows your address');
  process.exit(1);
}

const { rows: [version] } = await client.query('SELECT version()');
const major = Number((version.version.match(/PostgreSQL (\d+)/) ?? [])[1] ?? 0);
if (major >= 14) ok(`PostgreSQL ${major}`);
else bad(`PostgreSQL ${major || '?'}`, 'the schema uses syntax that wants 14 or newer');

/* Available and installed are different questions, and so is "may this role
   install it" — a provider can ship the extension and still refuse it to the
   user you were given. */
const { rows: available } = await client.query(
  `SELECT default_version FROM pg_available_extensions WHERE name = 'postgis'`,
);
const { rows: installed } = await client.query(
  `SELECT extversion FROM pg_extension WHERE extname = 'postgis'`,
);

if (installed[0]) {
  ok(`PostGIS ${installed[0].extversion} already installed`);
} else if (available[0]) {
  ok(`PostGIS ${available[0].default_version} is available`);
  await client.query('BEGIN');
  try {
    await client.query('CREATE EXTENSION postgis');
    ok('and this role may install it');
  } catch (error) {
    bad(`this role may not install it: ${error.message.split('\n')[0]}`,
      'ask the provider to enable postgis, or connect as a role that can');
  }
  await client.query('ROLLBACK');
} else {
  bad('PostGIS is not available on this server',
    'this database cannot run TeenHire — every page runs a PostGIS query');
}

/* Can we create things at all? A read-only role connects perfectly and then
   fails on the first migration. */
await client.query('BEGIN');
try {
  await client.query('CREATE TABLE _teenhire_preflight (x int)');
  ok('this role may create tables');
} catch (error) {
  bad(`this role may not create tables: ${error.message.split('\n')[0]}`,
    'the migrations need DDL — use the owner role, not a read-only one');
}
await client.query('ROLLBACK');

const { rows: [{ count }] } = await client.query(
  `SELECT count(*)::text AS count FROM information_schema.tables WHERE table_schema = 'public'`,
);
console.log(`     ${count} tables in public — ${count === '0' ? 'empty, so a first migration will create everything' : 'already has a schema'}`);

await client.end();

console.log(problems === 0
  ? '\nThis database can run TeenHire. Next: npm run db:migrate'
  : `\n${problems} problem${problems === 1 ? '' : 's'} — see above.`);
process.exit(problems === 0 ? 0 : 1);
