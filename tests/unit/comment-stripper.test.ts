import { describe, expect, it } from 'vitest';
import { stripCStyleComments, stripHashComments } from '../../src/core/utils/text';
import { intBelow, makeRandom, pick } from '../support/seeded-random';

/**
 * Property sweep over a seeded PRNG (see tests/support/seeded-random.ts).
 * The seeds are fixed on purpose: a failing sample reproduces exactly, and
 * a new sweep only happens when someone deliberately changes the seed.
 */

// Individually balanced noise units — no dangling quote, backslash, or
// unclosed comment — and none *ends* with `/` or `*`, so no concatenation
// of two units can open a comment right before a string literal.
const NOISE_ATOMS = [
  'a',
  'b',
  '=',
  ';',
  '{',
  '}',
  ' ',
  '\n',
  '// c\n',
  '/* c */;',
  '/x',
  '*x',
  'x',
];
const LITERAL_CONTENT_ATOMS = [
  'a',
  ' ',
  '// x',
  '/* y */',
  '*/ z',
  '\\n',
  '\\"',
  '\\\\',
  'from "./ghost"',
];
// Unbalanced chaos: quotes, escapes and nested comment markers in any order.
const CHAOS_ATOMS = ['a', '=', '/', '*', ' ', '\n', '"', "'", '\\', '`', '//', '/*', '*/'];

function randomLiteral(random: ReturnType<typeof makeRandom>): string {
  let content = '';
  for (let parts = intBelow(random, 3) + 1; parts > 0; parts -= 1) {
    content += pick(random, LITERAL_CONTENT_ATOMS);
  }
  // A trailing lone backslash would escape the closing quote.
  if (content.endsWith('\\')) content += ' ';
  // Contents that already carry a bare double quote only stay balanced
  // inside single quotes.
  const quote = content.includes('"') ? "'" : random() < 0.5 ? '"' : "'";
  return `${quote}${content}${quote}`;
}

describe('stripCStyleComments invariants (seeded property sweep)', () => {
  it('preserves length, line structure and string contents across random samples', () => {
    const random = makeRandom(20261111);
    for (let sample = 0; sample < 300; sample += 1) {
      let source = '';
      const literals: string[] = [];
      for (let atoms = intBelow(random, 12); atoms > 0; atoms -= 1) {
        if (random() < 0.4) {
          const literal = randomLiteral(random);
          literals.push(literal);
          source += literal;
        } else {
          source += pick(random, NOISE_ATOMS);
        }
      }
      const stripped = stripCStyleComments(source);
      // The stripper only ever swaps a character for a space or keeps it,
      // so both the total length and every line boundary must survive.
      expect(stripped.length).toBe(source.length);
      expect(stripped.split('\n').map((line) => line.length)).toEqual(
        source.split('\n').map((line) => line.length),
      );
      // String contents are passed through verbatim (utils/text.ts design).
      for (const literal of literals) {
        expect(stripped).toContain(literal);
      }
    }
  });

  it('never throws on chaotic samples with unbalanced quotes and nested comments', () => {
    const random = makeRandom(7);
    for (let sample = 0; sample < 500; sample += 1) {
      let source = '';
      for (let atoms = intBelow(random, 20); atoms >= 0; atoms -= 1) {
        source += pick(random, CHAOS_ATOMS);
      }
      let stripped = '';
      expect(() => {
        stripped = stripCStyleComments(source);
      }).not.toThrow();
      expect(stripped.length).toBe(source.length);
      expect(stripped.split('\n')).toHaveLength(source.split('\n').length);
    }
  });
});

describe('stripCStyleComments', () => {
  it('removes line comments while preserving line structure', () => {
    const source = 'const a = 1; // import x from "./fake"\nconst b = 2;';
    const stripped = stripCStyleComments(source);
    expect(stripped).not.toContain('import');
    expect(stripped.split('\n')).toHaveLength(2);
  });

  it('removes block comments but keeps newlines inside them', () => {
    const source = 'a;/* hidden\ncode */b';
    const stripped = stripCStyleComments(source);
    expect(stripped).not.toContain('hidden');
    expect(stripped.split('\n')).toHaveLength(2);
  });

  it('preserves strings that contain comment-like sequences', () => {
    const source = 'const url = "http://example.com"; const c = 1;';
    expect(stripCStyleComments(source)).toContain('http://example.com');
  });

  it('handles escaped quotes inside strings', () => {
    const source = 'const s = "a \\" b // not a comment";';
    const stripped = stripCStyleComments(source);
    expect(stripped).toContain('not a comment');
  });
});

describe('stripHashComments', () => {
  it('removes hash comments while preserving line structure', () => {
    const source = 'x = 1  # from os import path\ny = 2';
    const stripped = stripHashComments(source);
    expect(stripped).not.toContain('import');
    expect(stripped.split('\n')).toHaveLength(2);
  });

  it('preserves strings containing hash characters', () => {
    const source = "s = '# not a comment'\n";
    expect(stripHashComments(source)).toContain('# not a comment');
  });

  it('honors escaped quotes inside strings', () => {
    const source = 's = "a \\" # not a comment"\n';
    expect(stripHashComments(source)).toContain('# not a comment');
  });
});
