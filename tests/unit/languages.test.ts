import { describe, expect, it } from 'vitest';
import { languageIdForPath } from '../../src/core/utils/languages';

describe('languageIdForPath', () => {
  it('maps extensions to language ids', () => {
    expect(languageIdForPath('C:/proj/src/a.ts')).toBe('typescript');
    expect(languageIdForPath('C:/proj/README.md')).toBe('markdown');
    expect(languageIdForPath('C:/proj/app.py')).toBe('python');
  });

  it('recognizes well-known extensionless basenames', () => {
    expect(languageIdForPath('C:/proj/Dockerfile')).toBe('dockerfile');
    expect(languageIdForPath('C:/proj/dockerfile')).toBe('dockerfile');
    expect(languageIdForPath('C:/proj/Makefile')).toBe('makefile');
    expect(languageIdForPath('C:/proj/CMakeLists.txt')).toBe('cmake');
  });

  it('falls back to plaintext for unknown files', () => {
    expect(languageIdForPath('C:/proj/unknown.xyz')).toBe('plaintext');
    expect(languageIdForPath('C:/proj/noext')).toBe('plaintext');
  });
});
