import { describe, expect, it } from 'vitest';
import { DEFAULT_EXCLUDES, resolveExcludePatterns } from '../../src/core/domain/bundle';
import { IgnoreMatcher } from '../../src/core/services/ignore/gitignore-matcher';

describe('resolveExcludePatterns', () => {
  it('returns the built-in defaults when the user list is empty', () => {
    expect(resolveExcludePatterns([])).toEqual(DEFAULT_EXCLUDES);
    expect(DEFAULT_EXCLUDES).toHaveLength(11);
  });

  it('appends user patterns after the defaults', () => {
    const merged = resolveExcludePatterns(['*.log', 'tmp/']);
    expect(merged).toEqual([...DEFAULT_EXCLUDES, '*.log', 'tmp/']);
    expect(merged.indexOf('*.log')).toBeGreaterThan(merged.indexOf('node_modules/**'));
  });

  it('lets a user negation re-include a default-excluded tree', () => {
    const matcher = IgnoreMatcher.fromPatterns(resolveExcludePatterns(['!node_modules/**']));
    expect(matcher.isIgnored('node_modules/a.js')).toBe(false);
    expect(matcher.isIgnored('dist/b.js')).toBe(true);
  });
});
