import { describe, expect, it } from 'vitest';

import { clampInt } from '../../src/core/utils/numbers';

describe('clampInt', () => {
  it('floors and clamps finite values into the range', () => {
    expect(clampInt(5, 3, 0, 10)).toBe(5);
    expect(clampInt(-1, 3, 0, 10)).toBe(0);
    expect(clampInt(99, 3, 0, 10)).toBe(10);
    expect(clampInt(2.9, 3, 0, 10)).toBe(2);
  });

  it('falls back to the default when the value is not a finite number', () => {
    expect(clampInt(Number.NaN, 3, 0, 10)).toBe(3);
    expect(clampInt(Number.POSITIVE_INFINITY, 3, 0, 10)).toBe(3);
    // Mistyped settings reach the adapter typed as number but are strings:
    // even a numeric-looking one falls back rather than being coerced.
    expect(clampInt('abc' as unknown as number, 256, 1)).toBe(256);
    expect(clampInt('5' as unknown as number, 256, 1)).toBe(256);
    expect(clampInt(null as unknown as number, 3, 0, 10)).toBe(3);
  });

  it('supports an open-ended upper bound', () => {
    expect(clampInt(9_999, 256, 1)).toBe(9_999);
    expect(clampInt(0, 256, 1)).toBe(1);
  });
});
