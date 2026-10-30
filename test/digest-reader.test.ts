import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');
  const row = (job: string) => night?.rows.find((r) => r.job === job);

  it('reads one row per job, sorted by job, and counts the bad line', () => {
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(night?.badLines).toBe(1);
  });

  it('keeps the last error after a retry streak that ended ok', () => {
    expect(row('fixtures/refresh')).toMatchObject({
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
    });
  });

  it('keeps a failed job and a job without owner', () => {
    expect(row('notes/backup')?.lastStatus).toBe('fail');
    expect(row('digest/render')?.owner).toBeNull();
  });

  it('keeps the offset from the log', () => {
    expect(row('fixtures/refresh')).toMatchObject({
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });
});

describe('readNight on a temp runs dir', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns null for a night with no file', () => {
    expect(readNight(dir, '2026-01-01')).toBeNull();
  });

  it('returns null for a night that is not YYYY-MM-DD', () => {
    writeFileSync(join(dir, 'x.jsonl'), '');
    expect(readNight(join(dir, 'sub'), '../x')).toBeNull();
  });

  it('reads an empty file as no rows', () => {
    writeFileSync(join(dir, '2026-01-01.jsonl'), '');
    expect(readNight(dir, '2026-01-01')).toEqual({
      night: '2026-01-01',
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('orders by instant across offsets and counts wrong shapes as bad lines', () => {
    const lines = [
      { at: '2026-01-01T00:30:00Z', job: 'a', status: 'ok', owner: 'y' },
      { at: '2026-01-01T02:00:00+03:00', job: 'a', status: 'fail', owner: 'x', error: 'boom' },
      { at: '2026-01-01T00:10:00Z', job: 'a', status: 'retry', owner: 'y', error: 'late' },
      { at: '2026-01-01T00:00:00Z', job: 'b', status: 'maybe', owner: null },
    ];
    const text = lines.map((l) => JSON.stringify(l)).join('\n') + '\n\n';
    writeFileSync(join(dir, '2026-01-01.jsonl'), text);
    const night = readNight(dir, '2026-01-01');
    expect(night?.badLines).toBe(1);
    expect(night?.counts).toEqual({ ok: 1, retry: 1, fail: 1 });
    expect(night?.rows).toEqual([
      {
        job: 'a',
        owner: 'y',
        runs: 3,
        retries: 1,
        lastStatus: 'ok',
        lastError: 'late',
        firstAt: '2026-01-01T02:00:00+03:00',
        lastAt: '2026-01-01T00:30:00Z',
      },
    ]);
  });
});
