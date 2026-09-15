/* Whatever runs on a schedule.
 *
 * Plain JavaScript with no dependencies, because it has to run inside the
 * standalone runtime image, which has no TypeScript toolchain. All it does is
 * ask the app to drain its own queue — the work itself is a route handler that
 * Next has already compiled.
 *
 *   node scripts/drain.mjs        one pass, then exit (for a cron entry)
 *   node scripts/drain.mjs 30     a pass every 30 seconds (for a worker
 *                                 process that stays up)
 *
 * Deliberately not a timer inside the web process: one that also sends mail
 * sends nothing while it is being deployed, and sends everything twice when
 * two instances are running. */

const BASE = (process.env.DRAIN_URL ?? process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const SECRET = process.env.NOTIFY_WORKER_SECRET;

if (!SECRET) {
  console.error('[drain] NOTIFY_WORKER_SECRET is not set');
  process.exit(1);
}

async function pass() {
  try {
    const response = await fetch(`${BASE}/api/notify/drain`, {
      method: 'POST',
      headers: { authorization: `Bearer ${SECRET}` },
    });
    if (!response.ok) {
      console.error(`[drain] ${response.status} ${(await response.text()).slice(0, 200)}`);
      return;
    }
    const result = await response.json();
    if (result.considered > 0) {
      console.log(
        `[drain] ${result.considered} due · ${result.sent} sent · ` +
          `${result.failed} retrying · ${result.suppressed} given up on`,
      );
    }
  } catch (error) {
    /* The app restarting during a deploy is the common case. Nothing is lost:
       every message is a row, and the next pass picks it up. */
    console.error(`[drain] could not reach the app: ${error.message}`);
  }
}

const every = Number(process.argv[2] ?? 0);
if (!every) {
  await pass();
} else {
  console.log(`[drain] every ${every}s against ${BASE}`);
  for (;;) {
    await pass();
    await new Promise((resolve) => setTimeout(resolve, every * 1000));
  }
}
