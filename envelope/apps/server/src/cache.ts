import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface CacheEntry<T> {
  key: string;
  source: string;
  fetchedAt: string; // ISO 8601, UTC
  data: T;
}

export function cacheKeyHash(key: string): string {
  return createHash('sha1').update(key).digest('hex');
}

/**
 * File cache for upstream API responses. Every response is written to disk so the
 * demo can run offline; entries are never auto-deleted.
 */
export class FileCache {
  constructor(private readonly dir: string) {}

  private pathFor(key: string): string {
    return join(this.dir, `${cacheKeyHash(key)}.json`);
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    try {
      const raw = await readFile(this.pathFor(key), 'utf8');
      return JSON.parse(raw) as CacheEntry<T>;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, source: string, data: T, now: Date = new Date()): Promise<CacheEntry<T>> {
    const entry: CacheEntry<T> = { key, source, fetchedAt: now.toISOString(), data };
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.pathFor(key), JSON.stringify(entry), 'utf8');
    return entry;
  }

  /** True when the entry is younger than maxAgeMs. */
  static isFresh(entry: CacheEntry<unknown>, maxAgeMs: number, now: Date = new Date()): boolean {
    return now.getTime() - Date.parse(entry.fetchedAt) < maxAgeMs;
  }
}
