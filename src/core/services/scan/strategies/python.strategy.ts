import * as nodePath from 'node:path';
import { stripHashComments } from '../../../utils/text';
import type { ImportLanguageStrategy, ResolvedCandidate } from '../import-scanner';

/**
 * Python strategy. Explicit relative imports (`from . import x`,
 * `from ..pkg.mod import y`) resolve against the importing file's location.
 * Absolute imports (`import pkg.mod`) become root-relative candidates so any
 * matching file inside the workspace is picked up; unmatched stdlib or
 * third-party names simply never exist on disk and are dropped.
 */
export class PythonImportStrategy implements ImportLanguageStrategy {
  readonly id = 'python';
  readonly languageIds = ['python'];
  readonly extensions = ['.py'];

  extractImports(source: string, importerAbsolutePath: string): readonly ResolvedCandidate[] {
    const stripped = stripHashComments(source);
    const specifiers = new Set<string>();

    const fromRe = /^[ \t]*from[ \t]+((?:\.+)?[\w.]*)[ \t]+import\b/gm;
    let match: RegExpExecArray | null = fromRe.exec(stripped);
    while (match !== null) {
      const specifier = match[1];
      if (specifier !== undefined) specifiers.add(specifier);
      match = fromRe.exec(stripped);
    }

    const importRe = /^[ \t]*import[ \t]+([\w.]+(?:[ \t]*,[ \t]*[\w.]+)*)/gm;
    match = importRe.exec(stripped);
    while (match !== null) {
      const list = match[1] ?? '';
      for (const part of list.split(',')) {
        const specifier = part.trim();
        if (specifier.length > 0) specifiers.add(specifier);
      }
      match = importRe.exec(stripped);
    }

    const dir = nodePath.dirname(importerAbsolutePath);
    const out: ResolvedCandidate[] = [];
    for (const specifier of specifiers) {
      if (specifier === '__future__' || specifier.startsWith('__future__.')) continue;
      const dots = /^\.+/.exec(specifier)?.[0]?.length ?? 0;
      if (dots > 0) {
        // One dot = current package; each extra dot climbs one level.
        let startDir = dir;
        for (let i = 1; i < dots; i += 1) startDir = nodePath.dirname(startDir);
        const modulePath = specifier
          .slice(dots)
          .split('.')
          .filter((s) => s.length > 0)
          .join('/');
        const base = modulePath.length > 0 ? nodePath.join(startDir, modulePath) : startDir;
        // `from . import x` names the package itself: only its __init__.py
        // is a meaningful candidate (a sibling <pkg>.py is not).
        if (modulePath.length > 0) out.push({ kind: 'absolute', path: `${base}.py` });
        out.push({ kind: 'absolute', path: nodePath.join(base, '__init__.py') });
      } else {
        const modulePath = specifier.split('.').join('/');
        out.push({ kind: 'root-relative', path: `${modulePath}.py` });
        out.push({ kind: 'root-relative', path: `${modulePath}/__init__.py` });
      }
    }
    return out;
  }
}
