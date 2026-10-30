import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, Night, ReadNight, RunLine, RunStatus } from './types.js';

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStatus(value: unknown): value is RunStatus {
  return STATUSES.some((s) => s === value);
}

// A parsed line plus what the reader needs to order it.
type Entry = { line: RunLine; instant: number };

function parseLine(text: string): Entry | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  const { at, job, status, owner, error } = value;
  if (typeof at !== 'string' || typeof job !== 'string' || !isStatus(status)) return null;
  if (owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && typeof error !== 'string') return null;
  const instant = Date.parse(at);
  if (Number.isNaN(instant)) return null;
  const line: RunLine = { at, job, status, owner };
  if (error !== undefined) line.error = error;
  return { line, instant };
}

function readFile(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    if (isRecord(err) && err.code === 'ENOENT') return null;
    throw err;
  }
}

type Acc = { runs: number; retries: number; first: Entry; last: Entry; lastWithError: Entry | null };

export const readNight: ReadNight = (runsDir, night) => {
  if (!NIGHT.test(night)) return null;
  const text = readFile(join(runsDir, `${night}.jsonl`));
  if (text === null) return null;

  const counts: Record<RunStatus, number> = { ok: 0, retry: 0, fail: 0 };
  const jobs = new Map<string, Acc>();
  let badLines = 0;

  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    const entry = parseLine(raw);
    if (entry === null) {
      badLines++;
      continue;
    }
    const { line, instant } = entry;
    counts[line.status]++;
    const acc = jobs.get(line.job);
    if (acc === undefined) {
      jobs.set(line.job, {
        runs: 1,
        retries: line.status === 'retry' ? 1 : 0,
        first: entry,
        last: entry,
        lastWithError: line.error !== undefined ? entry : null,
      });
      continue;
    }
    acc.runs++;
    if (line.status === 'retry') acc.retries++;
    // File order breaks ties: earliest keeps the first seen, latest takes the last seen.
    if (instant < acc.first.instant) acc.first = entry;
    if (instant >= acc.last.instant) acc.last = entry;
    if (line.error !== undefined && (acc.lastWithError === null || instant >= acc.lastWithError.instant)) {
      acc.lastWithError = entry;
    }
  }

  const rows: DigestRow[] = [...jobs.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([job, acc]) => ({
      job,
      owner: acc.last.line.owner,
      runs: acc.runs,
      retries: acc.retries,
      lastStatus: acc.last.line.status,
      lastError: acc.lastWithError?.line.error ?? null,
      firstAt: acc.first.line.at,
      lastAt: acc.last.line.at,
    }));

  const result: Night = { night, rows, badLines, counts };
  return result;
};
