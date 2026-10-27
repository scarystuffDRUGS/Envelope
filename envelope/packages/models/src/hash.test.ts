import { describe, expect, it } from 'vitest';
import { fnv1a32, hashObject, stableStringify } from './hash';

describe('fnv1a32', () => {
  // Reference values: FNV-1a 32-bit test vectors (Fowler/Noll/Vo reference suite).
  it('matches published test vectors', () => {
    expect(fnv1a32('')).toBe('811c9dc5');
    expect(fnv1a32('a')).toBe('e40c292c');
    expect(fnv1a32('foobar')).toBe('bf9cf968');
  });
});

describe('stableStringify / hashObject', () => {
  it('ignores key order', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: [3, 4] } })).toBe('{"a":{"c":[3,4],"d":2},"b":1}');
    expect(hashObject({ x: 1, y: 2 })).toBe(hashObject({ y: 2, x: 1 }));
  });

  it('changes when a value changes', () => {
    expect(hashObject({ hour: 14 })).not.toBe(hashObject({ hour: 15 }));
  });

  it('drops undefined fields', () => {
    expect(stableStringify({ a: 1, b: undefined })).toBe('{"a":1}');
  });
});
