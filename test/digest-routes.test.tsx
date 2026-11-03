import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

const NORMAL = '2026-01-01';
const EMPTY = '2026-01-02';
const BAD = '2026-01-03';
const MISSING = '2026-01-04';

const line = (at: string, job: string, status: string, owner: string | null, error?: string) =>
  JSON.stringify({ at, job, status, owner, ...(error ? { error } : {}) });

let dir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  mkdirSync(dir, { recursive: true });
  const good = [
    line('2026-01-01T02:00:00+01:00', 'zeta', 'ok', 'ann'),
    line('2026-01-01T02:05:00+01:00', 'alpha', 'retry', null, 'timeout'),
    line('2026-01-01T02:10:00+01:00', 'alpha', 'ok', null),
    line('2026-01-01T02:15:00+01:00', 'mid', 'fail', 'bob', 'boom'),
  ];
  writeFileSync(join(dir, `${NORMAL}.jsonl`), good.join('\n') + '\n');
  writeFileSync(join(dir, `${EMPTY}.jsonl`), '');
  writeFileSync(join(dir, `${BAD}.jsonl`), [good[0], 'not json {', good[1], good[3]].join('\n') + '\n');
  app = createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: dir });
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

// Job names from the first cell of each body row of the table.
function jobsFromHtml(html: string): string[] {
  const body = html.slice(html.indexOf('<table'));
  const rows = body.match(/<tr[\s\S]*?<\/tr>/g) ?? [];
  const out: string[] = [];
  for (const r of rows) {
    const td = r.match(/<td[^>]*>([\s\S]*?)<\/td>/);
    if (td) out.push(td[1].replace(/<[^>]*>/g, '').trim());
  }
  return out;
}

describe('digest routes', () => {
  it('page and JSON answer 200 for a normal night', async () => {
    const page = await app.request(`/digest/${NORMAL}`);
    const api = await app.request(`/api/digest/${NORMAL}`);
    expect(page.status).toBe(200);
    expect(api.status).toBe(200);
    expect(await page.text()).toContain('<table');
    const night = (await api.json()) as Night;
    expect(night.night).toBe(NORMAL);
    expect(night.badLines).toBe(0);
    expect(night.rows.map((r) => r.job)).toEqual(['alpha', 'mid', 'zeta']);
  });

  it('both answer 404 for a night with no file', async () => {
    expect((await app.request(`/digest/${MISSING}`)).status).toBe(404);
    expect((await app.request(`/api/digest/${MISSING}`)).status).toBe(404);
  });

  it('empty night: page says nothing ran, JSON has no rows', async () => {
    const page = await app.request(`/digest/${EMPTY}`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('nothing ran');
    const api = await app.request(`/api/digest/${EMPTY}`);
    expect(api.status).toBe(200);
    expect(await api.json()).toEqual({ night: EMPTY, rows: [], badLines: 0 });
  });

  it('a bad line is counted, not fatal', async () => {
    const page = await app.request(`/digest/${BAD}`);
    expect(page.status).toBe(200);
    const api = await app.request(`/api/digest/${BAD}`);
    expect(api.status).toBe(200);
    const night = (await api.json()) as Night;
    expect(night.badLines).toBe(1);
    expect(night.rows.map((r) => r.job)).toEqual(['alpha', 'mid', 'zeta']);
  });

  it('page and JSON list the same jobs in the same order', async () => {
    for (const n of [NORMAL, BAD]) {
      const html = await (await app.request(`/digest/${n}`)).text();
      const night = (await (await app.request(`/api/digest/${n}`)).json()) as Night;
      expect(jobsFromHtml(html)).toEqual(night.rows.map((r) => r.job));
    }
  });

  it('page shows the lane banner, a dash for a null owner, and warn rows', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const html = await (await app.request(`/digest/${NORMAL}`)).text();
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('—');
    expect(html).toMatch(/class="[^"]*\bwarn\b/);
  });
});
