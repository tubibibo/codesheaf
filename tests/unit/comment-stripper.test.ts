import { describe, expect, it } from 'vitest';
import { stripCStyleComments, stripHashComments } from '../../src/core/utils/text';

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
