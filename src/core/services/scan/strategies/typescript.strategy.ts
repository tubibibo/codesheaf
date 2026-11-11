import * as nodePath from 'node:path';
import { stripCStyleComments } from '../../../utils/text';
import { absoluteCandidates } from '../candidate';
import type {
  ImportLanguageStrategy,
  ImportScanContext,
  ResolvedCandidate,
} from '../import-scanner';
import { matchAlias } from '../tsconfig-aliases';

/**
 * TypeScript / JavaScript strategy. Handles static imports, type-only
 * imports, side-effect imports, re-exports (`export ... from`), CommonJS
 * `require()` and dynamic `import()`. Relative specifiers (`./`, `../`)
 * resolve against the importer's directory; non-relative specifiers match
 * the workspace root's tsconfig `paths` aliases when one is supplied
 * (ADR-0009) — bare package names are third-party dependencies by
 * definition and stay skipped (see ADR-0003).
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

  extractImports(
    source: string,
    importerAbsolutePath: string,
    context?: ImportScanContext,
  ): readonly ResolvedCandidate[] {
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
      if (specifier.startsWith('./') || specifier.startsWith('../')) {
        const base = nodePath.resolve(dir, specifier);
        out.push(...absoluteCandidates(base, this.extensions));
        continue;
      }
      // Non-relative: only a matched tsconfig alias maps to local files;
      // everything else (bare packages, URLs) is skipped as before.
      const bases =
        context?.aliases === undefined ? undefined : matchAlias(context.aliases, specifier);
      if (bases === undefined) continue;
      for (const base of bases) out.push(...absoluteCandidates(base, this.extensions));
    }
    return out;
  }
}
