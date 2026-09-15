import { getPool } from '../lib/db';
import { deliverDue } from '../lib/server/notify';
import { providerFor } from '../lib/server/delivery';

/* The worker. Run it on a schedule — a cron entry, a Fly machine, a container
 * that wakes every minute — and it drains whatever is due.
 *
 *   npm run notify:work        one pass, then exit
 *   npm run notify:work -- 30  a pass every 30 seconds until killed
 *
 * Deliberately a script rather than a background timer inside the web process.
 * A web process that also sends mail sends nothing while it is being deployed,
 * and sends everything twice when two instances are running. */

async function pass(): Promise<void> {
  const result = await deliverDue();
  if (result.considered > 0) {
    console.log(
      `[worker] ${result.considered} due · ${result.sent} sent · ` +
        `${result.failed} retrying · ${result.suppressed} given up on`,
    );
  }
}

async function main(): Promise<void> {
  /* Resolved once, up front: if this process is misconfigured it should say so
     immediately rather than after the first message fails to go out. */
  console.log(`[worker] provider: ${providerFor().name}`);

  const everySeconds = Number(process.argv[2] ?? 0);
  if (!everySeconds) {
    await pass();
    await getPool().end();
    return;
  }

  console.log(`[worker] every ${everySeconds}s — ctrl-c to stop`);
  for (;;) {
    await pass();
    await new Promise((resolve) => setTimeout(resolve, everySeconds * 1000));
  }
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
