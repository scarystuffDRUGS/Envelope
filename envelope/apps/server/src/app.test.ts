import { describe, expect, it } from 'vitest';
import { app } from './app';
import { RateLimiter, clientIp } from './rateLimit';

describe('server routes', () => {
  it('GET /api/health reports ok and key presence without values', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; keys: Record<string, unknown> };
    expect(body.ok).toBe(true);
    for (const v of Object.values(body.keys)) expect(typeof v).toBe('boolean');
  });

  it('unknown routes return JSON 404', async () => {
    const res = await app.request('/api/nope');
    expect(res.status).toBe(404);
  });

  it('rejects site-data requests outside valid coordinates or past years', async () => {
    expect((await app.request('/api/site-data?lat=95&lon=77&year=2025')).status).toBe(400);
    expect((await app.request('/api/site-data?lat=28&lon=77&year=2099')).status).toBe(400);
  });

  it('rejects report requests without a payload, and bodies over 4 MB', async () => {
    const post = (body: string) =>
      app.request('/api/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    expect((await post('{}')).status).toBe(400);
    expect((await post('not json')).status).toBe(400);
    expect((await post(JSON.stringify({ pad: 'x'.repeat(4.2 * 1024 * 1024) }))).status).toBe(413);
  });
});

describe('rate limiter', () => {
  it('allows the limit per window, then reports the wait in seconds', () => {
    const rl = new RateLimiter(2, 60_000);
    expect(rl.take('a', 0)).toBe(0);
    expect(rl.take('a', 1_000)).toBe(0);
    expect(rl.take('a', 2_000)).toBe(58);
    expect(rl.take('b', 2_000)).toBe(0); // per key
    expect(rl.take('a', 60_000)).toBe(0); // new window
  });

  it('takes the first x-forwarded-for hop as the client IP', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe('203.0.113.7');
    expect(clientIp(new Headers())).toBe('local');
  });
});
