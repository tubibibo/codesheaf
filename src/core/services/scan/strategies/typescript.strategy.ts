import * as nodePath from 'node:path';
import { stripCStyleComments } from '../../../utils/text';
import { absoluteCandidates } from '../candidate';
import type { ImportLanguageStrategy, ResolvedCandidate } from '../import-scanner';

/**
 * TypeScript / JavaScript strategy. Handles static imports, type-only
 * imports, side-effect imports, re-exports (`export ... from`), CommonJS
 * `require()` and dynamic `import()`. Only relative specifiers (`./`, `../`)
 * are followed — bare package names are third-party dependencies by
 * definition and are skipped (see ADR-0003).
 */
export class TypeScriptImportStrategy implements ImportLanguageStrategy {
  readonly id = 'typescript';
  readonly languageIds = [
    'typescript',
    'typescriptreact',
    'javascript',
    'javascriptreact',
    'vue',
    'svelte',
  ];
  readonly extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

  extractImports(source: string, importerAbsolutePath: string): readonly ResolvedCandidate[] {
    const stripped = stripCStyleComments(source);
    const specifiers = new Set<string>();

    const patterns: readonly RegExp[] = [
      /import\s+(?:type\s+)?[^;'"]*?\bfrom\s*['"]([^'"]+)['"]/g,
      /import\s*['"]([^'"]+)['"]/g,
      /export\s+[^;'"]*?\bfrom\s*['"]([^'"]+)['"]/g,
      /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
      /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    ];
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null = pattern.exec(stripped);
      while (match !== null) {
        const specifier = match[1];
        if (specifier !== undefined) specifiers.add(specifier);
        match = pattern.exec(stripped);
      }
    }

    const dir = nodePath.dirname(importerAbsolutePath);
    const out: ResolvedCandidate[] = [];
    for (const specifier of specifiers) {
      if (!specifier.startsWith('./') && !specifier.startsWith('../')) continue;
      const base = nodePath.resolve(dir, specifier);
      out.push(...absoluteCandidates(base, this.extensions));
    }
    return out;
  }
}
