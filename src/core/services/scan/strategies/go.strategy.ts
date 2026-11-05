import * as nodePath from 'node:path';
import { stripCStyleComments } from '../../../utils/text';
import type { ImportLanguageStrategy, ResolvedCandidate } from '../import-scanner';
import { hasDotDotSegment } from '../../../utils/paths';

/**
 * Go strategy. Reads both single (`import "x"`) and block (`import ( ... )`)
 * declarations. Relative specifiers resolve against the importing file;
 * module paths become root-relative candidates (`pkg/util` -> `pkg/util.go`).
 * Without parsing `go.mod`, nested-package layouts (`pkg/util/util.go`) are a
 * documented limitation — stdlib names simply never match a file on disk.
 */
export class GoImportStrategy implements ImportLanguageStrategy {
  readonly id = 'go';
  readonly languageIds = ['go'];
  readonly extensions = ['.go'];

  extractImports(source: string, importerAbsolutePath: string): readonly ResolvedCandidate[] {
    const stripped = stripCStyleComments(source);
    const specifiers = new Set<string>();

    const blockRe = /import\s*\(([^)]*)\)/g;
    let match: RegExpExecArray | null = blockRe.exec(stripped);
    while (match !== null) {
      const body = match[1] ?? '';
      const lineRe = /"([^"]+)"/g;
      let lineMatch: RegExpExecArray | null = lineRe.exec(body);
      while (lineMatch !== null) {
        const specifier = lineMatch[1];
        if (specifier !== undefined) specifiers.add(specifier);
        lineMatch = lineRe.exec(body);
      }
      match = blockRe.exec(stripped);
    }

    const singleRe = /import\s+(?:[_A-Za-z]\w*\s+)?"([^"]+)"/g;
    match = singleRe.exec(stripped);
    while (match !== null) {
      const specifier = match[1];
      if (specifier !== undefined) specifiers.add(specifier);
      match = singleRe.exec(stripped);
    }

    const dir = nodePath.dirname(importerAbsolutePath);
    const out: ResolvedCandidate[] = [];
    for (const specifier of specifiers) {
      if (specifier.startsWith('./') || specifier.startsWith('../')) {
        const base = nodePath.resolve(dir, specifier);
        out.push({ kind: 'absolute', path: base.endsWith('.go') ? base : `${base}.go` });
      } else if (!hasDotDotSegment(specifier)) {
        out.push({
          kind: 'root-relative',
          path: specifier.endsWith('.go') ? specifier : `${specifier}.go`,
        });
      }
    }
    return out;
  }
}
