import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, Night, RunStatus } from './types.js';

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

type Line = { at: string; job: string; status: RunStatus; owner: string | null; error: string | null };

// Parse at the edge (styleguide): anything that is not a well-formed line is null.
function parseLine(text: string): Line | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.at !== 'string' || typeof o.job !== 'string') return null;
  if (typeof o.status !== 'string' || !STATUSES.includes(o.status as RunStatus)) return null;
  if (o.owner !== null && typeof o.owner !== 'string') return null;
  if (o.error !== undefined && o.error !== null && typeof o.error !== 'string') return null;
  return { at: o.at, job: o.job, status: o.status as RunStatus, owner: o.owner, error: (o.error as string | undefined) ?? null };
}

export function foldLines(text: string): { rows: DigestRow[]; badLines: number } {
  const byJob = new Map<string, DigestRow>();
  let badLines = 0;
  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    const l = parseLine(raw);
    if (!l) {
      badLines++;
      continue;
    }
    const r = byJob.get(l.job);
    if (!r) {
      byJob.set(l.job, {
        job: l.job, owner: l.owner, runs: 1, retries: l.status === 'retry' ? 1 : 0,
        lastStatus: l.status, lastError: l.error, firstAt: l.at, lastAt: l.at,
      });
      continue;
    }
    r.runs++;
    if (l.status === 'retry') r.retries++;
    // Lines are in log order; the last one wins.
    r.lastStatus = l.status;
    r.lastAt = l.at;
    if (l.error !== null) r.lastError = l.error;
    if (l.owner !== null) r.owner = l.owner;
  }
  const rows = [...byJob.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { rows, badLines };
}

/** runs/<night>.jsonl → one row per job. null when the night has no file (or is not a date). */
export function readNight(runsDir: string, night: string): Night | null {
  if (!NIGHT.test(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return null;
  }
  return { night, ...foldLines(text) };
}
