import { describe, expect, it } from 'vitest';
import { IgnoreMatcher } from '../../src/core/services/ignore/gitignore-matcher';
import { intBelow, makeRandom, pick } from '../support/seeded-random';

describe('IgnoreMatcher', () => {
  it('matches unanchored directory names at any depth', () => {
    const matcher = IgnoreMatcher.fromPatterns(['node_modules']);
    expect(matcher.isIgnored('node_modules/a.js')).toBe(true);
    expect(matcher.isIgnored('packages/app/node_modules/b.js')).toBe(true);
    expect(matcher.isIgnored('node_modulesx/a.js')).toBe(false);
    expect(matcher.isIgnored('src/main.ts')).toBe(false);
  });

  it('matches globstar-free wildcards against the basename', () => {
    const matcher = IgnoreMatcher.fromPatterns(['*.log']);
    expect(matcher.isIgnored('a.log')).toBe(true);
    expect(matcher.isIgnored('deep/dir/a.log')).toBe(true);
    expect(matcher.isIgnored('log/a.txt')).toBe(false);
  });

  it('applies negation with last-rule-wins semantics', () => {
    const matcher = IgnoreMatcher.fromPatterns(['*.log', '!keep.log']);
    expect(matcher.isIgnored('keep.log')).toBe(false);
    expect(matcher.isIgnored('other.log')).toBe(true);
  });

  it('honors directory-only patterns for directory paths but not plain files', () => {
    const matcher = IgnoreMatcher.fromPatterns(['build/']);
    expect(matcher.isIgnored('build')).toBe(false); // a *file* named build
    expect(matcher.isIgnored('build/x.js')).toBe(true); // pruned as a directory
    expect(matcher.isIgnored('nested/build/x.js')).toBe(true);
  });

  it('anchors patterns containing an inner slash to the root', () => {
    const matcher = IgnoreMatcher.fromPatterns(['src/temp']);
    expect(matcher.isIgnored('src/temp')).toBe(true);
    expect(matcher.isIgnored('src/temp/x.js')).toBe(true);
    expect(matcher.isIgnored('lib/src/temp')).toBe(false);
  });

  it('anchors leading-slash patterns to the root', () => {
    const matcher = IgnoreMatcher.fromPatterns(['/README.md']);
    expect(matcher.isIgnored('README.md')).toBe(true);
    expect(matcher.isIgnored('docs/README.md')).toBe(false);
  });

  it('supports the ** wildcard in the middle and at the end', () => {
    const matcher = IgnoreMatcher.fromPatterns(['**/dist/**']);
    expect(matcher.isIgnored('a/dist/b.js')).toBe(true);
    expect(matcher.isIgnored('dist/b.js')).toBe(true);
    expect(matcher.isIgnored('adist/b.js')).toBe(false);
  });

  it('supports the single-character wildcard', () => {
    const matcher = IgnoreMatcher.fromPatterns(['file?.ts']);
    expect(matcher.isIgnored('file1.ts')).toBe(true);
    expect(matcher.isIgnored('file12.ts')).toBe(false);
  });

  it('supports character classes', () => {
    const matcher = IgnoreMatcher.fromPatterns(['[abc].ts']);
    expect(matcher.isIgnored('a.ts')).toBe(true);
    expect(matcher.isIgnored('d.ts')).toBe(false);
  });

  it('ignores comments and blank lines', () => {
    const matcher = IgnoreMatcher.fromPatterns(['# a comment', '', '   ', 'build']);
    expect(matcher.isIgnored('build/x')).toBe(true);
    expect(matcher.isIgnored('comment/x')).toBe(false);
  });

  it('keeps regex metacharacters literal', () => {
    const matcher = IgnoreMatcher.fromPatterns(['a+b.txt']);
    expect(matcher.isIgnored('a+b.txt')).toBe(true);
    expect(matcher.isIgnored('aab.txt')).toBe(false);
  });

  describe('invariants (seeded property sweep, see tests/support/seeded-random.ts)', () => {
    // Deliberately weird atoms: unbalanced brackets, stray negations and
    // glob stars that never form valid patterns — the matcher must decide
    // *something* deterministic, never throw and never flip between calls.
    const PATTERN_ATOMS = [
      'src',
      'a',
      'b',
      '*.log',
      '/',
      '**',
      '?',
      '!',
      '[',
      ']',
      '.ts',
      'node_modules',
      'build',
      '#',
    ];
    const PATH_ATOMS = ['src', 'a', 'b', 'x.log', 'x.ts', '/', 'build', '.'];

    it('isIgnored never throws and is idempotent across a random pattern/path matrix', () => {
      const random = makeRandom(20261111);
      for (let sample = 0; sample < 250; sample += 1) {
        const patterns: string[] = [];
        for (let count = intBelow(random, 5); count > 0; count -= 1) {
          let pattern = '';
          for (let parts = intBelow(random, 4) + 1; parts > 0; parts -= 1) {
            pattern += pick(random, PATTERN_ATOMS);
          }
          patterns.push(pattern);
        }
        const path = Array.from({ length: intBelow(random, 4) + 1 }, () =>
          pick(random, PATH_ATOMS),
        ).join('');

        const matcher = IgnoreMatcher.fromPatterns(patterns);
        const results: boolean[] = [];
        expect(() => results.push(matcher.isIgnored(path))).not.toThrow();
        // Same query, same answer — no hidden state between calls.
        expect(matcher.isIgnored(path)).toBe(results[0]);
        // A fresh matcher over the same patterns decides identically.
        expect(IgnoreMatcher.fromPatterns(patterns).isIgnored(path)).toBe(results[0]);
      }
    });
  });
});
