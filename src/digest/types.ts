// Plan morning-digest § 1. The contract every part of § 2 builds against.

export type RunStatus = 'ok' | 'retry' | 'fail';

/** One job of one night, folded from all its lines in runs/<night>.jsonl. */
export type DigestRow = {
  job: string;
  /** null in the log; views show it as `—`. */
  owner: string | null;
  /** Lines for this job. */
  runs: number;
  /** Lines with status `retry`. */
  retries: number;
  lastStatus: RunStatus;
  /** `error` of the last line that had one, or null. */
  lastError: string | null;
  /** `at` as written in the log, offset kept. */
  firstAt: string;
  lastAt: string;
};

export type Night = {
  night: string;
  /** Sorted by job. */
  rows: DigestRow[];
  /** Lines that did not parse or did not match the shape. Counted, never thrown. */
  badLines: number;
};

/** Returns null when runs/<night>.jsonl does not exist; an empty file gives rows: []. */
export type ReadNight = (runsDir: string, night: string) => Night | null;
