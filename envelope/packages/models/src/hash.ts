/**
 * Deterministic JSON serialisation: object keys sorted, undefined dropped.
 * Two scenarios that differ only in key order serialise identically.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value))
    return `[${value.map((v) => stableStringify(v === undefined ? null : v)).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/** FNV-1a 32-bit hash of a string, as 8 lowercase hex chars. */
export function fnv1a32(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function hashObject(value: unknown): string {
  return fnv1a32(stableStringify(value));
}
