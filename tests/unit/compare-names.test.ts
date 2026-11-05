import { describe, expect, it } from 'vitest';
import { compareNames, hasDotDotSegment } from '../../src/core/utils/paths';

describe('compareNames', () => {
  it('sorts case-insensitively before code points', () => {
    const names = ['Zebra', 'apple', 'Banana', 'banana-split', 'Apple2'];
    expect([...names].sort(compareNames)).toEqual([
      'apple',
      'Apple2',
      'Banana',
      'banana-split',
      'Zebra',
    ]);
  });

  it('breaks case-insensitive ties by code points', () => {
    expect(compareNames('Beta', 'beta')).toBeLessThan(0); // 'B' < 'b'
    expect(compareNames('beta', 'beta')).toBe(0);
  });
});

describe('hasDotDotSegment', () => {
  it('matches whole traversal segments only', () => {
    expect(hasDotDotSegment('../outside/x.h')).toBe(true);
    expect(hasDotDotSegment('a/../../b')).toBe(true);
    expect(hasDotDotSegment('..foo.ts')).toBe(false);
    expect(hasDotDotSegment('a/..b/c')).toBe(false);
    expect(hasDotDotSegment('src/a.ts')).toBe(false);
    expect(hasDotDotSegment('src\\..\\outside')).toBe(true); // windows separators
  });
});
