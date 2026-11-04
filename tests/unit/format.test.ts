import { describe, expect, it } from 'vitest';
import { formatTokenCount } from '../../src/core/utils/format';

describe('formatTokenCount', () => {
  it('formats small counts as plain integers', () => {
    expect(formatTokenCount(0)).toBe('0');
    expect(formatTokenCount(1)).toBe('1');
    expect(formatTokenCount(999)).toBe('999');
  });

  it('formats thousands with the ~k suffix', () => {
    expect(formatTokenCount(1000)).toBe('~1k');
    expect(formatTokenCount(1500)).toBe('~1.5k');
    expect(formatTokenCount(150_000)).toBe('~150k');
  });

  it('formats millions with the ~M suffix', () => {
    expect(formatTokenCount(999_999)).toBe('~1M');
    expect(formatTokenCount(1_200_000)).toBe('~1.2M');
  });

  it('handles non-finite input defensively', () => {
    expect(formatTokenCount(Number.NaN)).toBe('0');
    expect(formatTokenCount(-5)).toBe('0');
  });
});
