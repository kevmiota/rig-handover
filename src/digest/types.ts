// Plan morning-digest § 1. The contract every part of § 2 builds against.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One parsed line of runs/<night>.jsonl.
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row per job. Times keep the offset from the log.
export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

export type Night = {
  night: string;
  // Sorted by job, so the page and the JSON agree.
  rows: DigestRow[];
  // Lines that didn't parse into a RunLine: counted, never thrown.
  badLines: number;
  // Parsed lines by status.
  counts: Record<RunStatus, number>;
};

// null when the night has no file (or isn't a YYYY-MM-DD night).
export type ReadNight = (runsDir: string, night: string) => Night | null;
