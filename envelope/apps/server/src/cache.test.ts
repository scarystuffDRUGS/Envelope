import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FileCache, cacheKeyHash } from './cache';

let dir: string | undefined;

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe('FileCache', () => {
  it('returns null for a missing key', async () => {
    dir = await mkdtemp(join(tmpdir(), 'envelope-cache-'));
    expect(await new FileCache(dir).get('nope')).toBeNull();
  });

  it('round-trips an entry with source and fetch time', async () => {
    dir = await mkdtemp(join(tmpdir(), 'envelope-cache-'));
    const cache = new FileCache(dir);
    const now = new Date('2026-01-02T03:04:05.000Z');
    await cache.set('open-meteo:archive:28.4,77.0', 'open-meteo', { t: [1, 2, 3] }, now);
    const entry = await cache.get<{ t: number[] }>('open-meteo:archive:28.4,77.0');
    expect(entry?.data.t).toEqual([1, 2, 3]);
    expect(entry?.source).toBe('open-meteo');
    expect(entry?.fetchedAt).toBe('2026-01-02T03:04:05.000Z');
  });

  it('judges freshness by age', () => {
    const entry = { key: 'k', source: 's', fetchedAt: '2026-01-01T00:00:00.000Z', data: null };
    const oneHourLater = new Date('2026-01-01T01:00:00.000Z');
    expect(FileCache.isFresh(entry, 2 * 3600_000, oneHourLater)).toBe(true);
    expect(FileCache.isFresh(entry, 1800_000, oneHourLater)).toBe(false);
  });

  it('hashes keys deterministically', () => {
    expect(cacheKeyHash('abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
  });
});
