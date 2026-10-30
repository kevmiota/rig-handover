import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

const NORMAL = '2026-01-10';
const EMPTY = '2026-01-11';
const BAD = '2026-01-12';
const MISSING = '2026-01-13';

const line = (at: string, job: string, status: string, owner: string | null) =>
  JSON.stringify({ at, job, status, owner });

let dir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  mkdirSync(dir, { recursive: true });
  // Jobs deliberately out of order in the file: the routes must sort by job.
  writeFileSync(
    join(dir, `${NORMAL}.jsonl`),
    [
      line('2026-01-10T23:00:03+01:00', 'zeta/sync', 'ok', 'rook'),
      line('2026-01-10T23:00:05+01:00', 'alpha/backup', 'retry', 'lane-07'),
      line('2026-01-11T01:00:05+01:00', 'alpha/backup', 'ok', 'lane-07'),
      line('2026-01-11T02:00:00+01:00', 'mid/orphan', 'ok', null),
    ].join('\n') + '\n',
  );
  writeFileSync(join(dir, `${EMPTY}.jsonl`), '');
  writeFileSync(
    join(dir, `${BAD}.jsonl`),
    [
      line('2026-01-12T23:00:03+01:00', 'beta/job', 'ok', 'rook'),
      'this is not json',
      line('2026-01-12T23:30:00+01:00', 'alpha/job', 'fail', 'lane-07'),
    ].join('\n') + '\n',
  );
  app = createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: dir });
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

// JSX escapes quotes and apostrophes; compare on the text a reader sees.
function decode(html: string): string {
  return html
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

// Job names from the page: the first cell of every body row, in document order.
function pageJobs(html: string): string[] {
  const jobs: string[] = [];
  for (const row of html.match(/<tr[\s>][\s\S]*?<\/tr>/g) ?? []) {
    const cell = /<td[\s>][\s\S]*?<\/td>/.exec(row);
    if (cell === null) continue;
    jobs.push(decode(cell[0].replace(/<[^>]*>/g, '')).trim());
  }
  return jobs;
}

async function getJson(night: string) {
  const res = await app.request(`/api/digest/${night}`);
  return { res, body: (await res.json()) as Night };
}

describe('GET /digest/:night', () => {
  it('lists the jobs of a night on disk, sorted by job', async () => {
    const res = await app.request(`/digest/${NORMAL}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(pageJobs(html)).toEqual(['alpha/backup', 'mid/orphan', 'zeta/sync']);
  });

  it('shows a dash for a job without an owner', async () => {
    const html = await (await app.request(`/digest/${NORMAL}`)).text();
    expect(html).toContain('—');
  });

  it('answers 404 with the lane banner for a night with no file', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await app.request(`/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('TEST-MARKER');
  });

  it('says nothing ran for an empty night', async () => {
    const res = await app.request(`/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('notes the bad line and still lists the valid jobs', async () => {
    const res = await app.request(`/digest/${BAD}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(decode(html)).toContain("1 line didn't parse");
    expect(pageJobs(html)).toEqual(['alpha/job', 'beta/job']);
  });
});

describe('GET /api/digest/:night', () => {
  it('returns the Night for a night on disk', async () => {
    const { res, body } = await getJson(NORMAL);
    expect(res.status).toBe(200);
    expect(body.night).toBe(NORMAL);
    expect(body.rows.map((r) => r.job)).toEqual(['alpha/backup', 'mid/orphan', 'zeta/sync']);
    expect(body.badLines).toBe(0);
    expect(body.counts).toEqual({ ok: 3, retry: 1, fail: 0 });
  });

  it('answers 404 JSON with the night for a night with no file', async () => {
    const res = await app.request(`/api/digest/${MISSING}`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: unknown; night: unknown };
    expect(body.night).toBe(MISSING);
    expect(typeof body.error).toBe('string');
  });

  it('returns no rows for an empty night', async () => {
    const { res, body } = await getJson(EMPTY);
    expect(res.status).toBe(200);
    expect(body.rows).toEqual([]);
    expect(body.badLines).toBe(0);
  });

  it('counts the bad line and keeps the valid rows', async () => {
    const { res, body } = await getJson(BAD);
    expect(res.status).toBe(200);
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['alpha/job', 'beta/job']);
  });
});

describe('page and JSON agree', () => {
  it.each([NORMAL, BAD])('lists the same jobs in the same order for %s', async (night) => {
    const html = await (await app.request(`/digest/${night}`)).text();
    const { body } = await getJson(night);
    expect(pageJobs(html)).toEqual(body.rows.map((r) => r.job));
  });
});
