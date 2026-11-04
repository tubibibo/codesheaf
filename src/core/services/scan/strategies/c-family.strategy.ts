import * as nodePath from 'node:path';
import { stripCStyleComments } from '../../../utils/text';
import type { ImportLanguageStrategy, ResolvedCandidate } from '../import-scanner';

/**
 * C / C++ strategy. Quoted includes (`#include "util.h"`) resolve against
 * the importing file's directory (with common header extensions probed) and
 * additionally as root-relative paths. System includes (`<...>`) are skipped.
 */
export class CFamilyImportStrategy implements ImportLanguageStrategy {
  readonly id = 'c-family';
  readonly languageIds = ['c', 'cpp', 'objective-c', 'objective-cpp'];
  readonly extensions = ['.c', '.h', '.cpp', '.hpp', '.cc', '.hh', '.cxx', '.hpp'];

  extractImports(source: string, importerAbsolutePath: string): readonly ResolvedCandidate[] {
    const stripped = stripCStyleComments(source);
    const includeRe = /^[ \t]*#[ \t]*include[ \t]*"([^"]+)"/gm;
    const specifiers = new Set<string>();
    let match: RegExpExecArray | null = includeRe.exec(stripped);
    while (match !== null) {
      const specifier = match[1];
      if (specifier !== undefined) specifiers.add(specifier);
      match = includeRe.exec(stripped);
    }

    const dir = nodePath.dirname(importerAbsolutePath);
    const headerExtensions = ['', '.h', '.hpp', '.hh'];
    const out: ResolvedCandidate[] = [];
    for (const specifier of specifiers) {
      const base = nodePath.resolve(dir, specifier);
      for (const ext of headerExtensions) out.push({ kind: 'absolute', path: base + ext });
      for (const ext of headerExtensions)
        out.push({ kind: 'root-relative', path: specifier + ext });
    }
    return out;
  }
}
