import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { deliverDue } from '@/lib/server/notify';

export const dynamic = 'force-dynamic';

/* Draining the queue, as an endpoint rather than a separate program.
 *
 * The runtime image is Next's standalone output: the server and the traced
 * dependencies it needs, with no TypeScript toolchain. A worker written in
 * TypeScript cannot run there without shipping a compiler into production, so
 * the work lives where Next already compiles it and anything on a schedule —
 * the worker process in fly.toml, a cron entry, an external pinger — calls
 * this.
 *
 * It is idempotent by construction. Two callers racing do redundant work
 * rather than sending twice: the send is guarded by the row's status and the
 * row was guarded by a unique dedupe key. */

function authorised(request: Request): boolean {
  const secret = process.env.NOTIFY_WORKER_SECRET;
  if (!secret) return false;

  const header = request.headers.get('authorization') ?? '';
  const given = Buffer.from(header.replace(/^Bearer\s+/i, ''));
  const expected = Buffer.from(secret);
  /* timingSafeEqual throws on a length mismatch, and the throw would itself
     leak the length, so the lengths are compared first. */
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(request: Request) {
  if (!process.env.NOTIFY_WORKER_SECRET) {
    /* Refused rather than left open. An unauthenticated drain endpoint lets
       anyone who finds the URL decide when a teenager's phone buzzes. */
    return NextResponse.json(
      { error: 'NOTIFY_WORKER_SECRET is not set, so this endpoint is closed' },
      { status: 503 },
    );
  }
  if (!authorised(request)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const result = await deliverDue();
  return NextResponse.json(result);
}
