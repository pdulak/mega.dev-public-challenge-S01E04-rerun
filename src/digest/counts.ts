import type { DigestRow } from './types.js';

export type Counts = { ok: number; retry: number; fail: number };

/** Per-line counts for a night: retry = sum(retries), fail = sum(fails), ok = sum(runs - retries - fails). */
export function countRows(rows: readonly DigestRow[]): Counts {
  const c: Counts = { ok: 0, retry: 0, fail: 0 };
  for (const r of rows) {
    c.retry += r.retries;
    c.fail += r.fails;
    c.ok += r.runs - r.retries - r.fails;
  }
  return c;
}
