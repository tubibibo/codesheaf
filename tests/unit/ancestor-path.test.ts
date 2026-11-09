import * as nodePath from 'node:path';
import { describe, expect, it } from 'vitest';
import { commonAncestor } from '../../src/core/utils/ancestor-path';

const WIN = nodePath.sep === '\\';

describe('commonAncestor', () => {
  it('returns the deepest shared directory on the same drive', () => {
    const a = WIN ? 'C:/proj/app/x.ts' : '/proj/app/x.ts';
    const b = WIN ? 'C:/proj/app/sub/y.ts' : '/proj/app/sub/y.ts';
    const expected = WIN ? 'C:\\proj\\app' : '/proj/app';
    expect(commonAncestor([a, b])).toBe(expected);
  });

  it('returns undefined when the inputs share only a filesystem root', () => {
    // POSIX: two top-level directories share only '/'; on Windows the same
    // shape arrives as drive-root-relative paths resolving to the drive root.
    const a = WIN ? 'C:/a/x.ts' : '/a/x.ts';
    const b = WIN ? 'C:/b/y.ts' : '/b/y.ts';
    expect(commonAncestor([a, b])).toBeUndefined();
  });

  it('returns undefined for inputs on different drives (Windows geometry)', () => {
    expect(commonAncestor(['C:/proj/a/x.ts', 'D:/other/b/y.ts'])).toBeUndefined();
  });

  it('folds `..` segments before comparing', () => {
    const a = WIN ? 'C:/proj/app/../lib/x.ts' : '/proj/app/../lib/x.ts';
    const b = WIN ? 'C:/proj/lib/y.ts' : '/proj/lib/y.ts';
    const expected = WIN ? 'C:\\proj\\lib' : '/proj/lib';
    expect(commonAncestor([a, b])).toBe(expected);
  });

  it('resolves relative inputs against the process working directory', () => {
    const expected = WIN
      ? nodePath.resolve('a').replace(/\\/g, (sep) => sep)
      : nodePath.resolve('a');
    expect(commonAncestor(['a/b/x.ts', 'a/c/y.ts'])).toBe(WIN ? nodePath.resolve('a') : expected);
  });

  it('rejects a lone root as a boundary', () => {
    expect(commonAncestor(['/'])).toBeUndefined();
  });

  it('returns undefined for zero inputs', () => {
    expect(commonAncestor([])).toBeUndefined();
  });

  it('handles a single pre-reduced directory input by returning it', () => {
    // Contract: the builder passes directories (files arrive as their
    // dirname), so a single directory is the boundary itself.
    const a = WIN ? 'C:/proj/src' : '/proj/src';
    const expected = WIN ? 'C:\\proj\\src' : '/proj/src';
    expect(commonAncestor([a])).toBe(expected);
  });
});
