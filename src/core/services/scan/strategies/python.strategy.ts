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
    const modules = new Set<string>();
    const fromImports: Array<{ module: string; names: readonly string[] }> = [];

    // Module part of `from <module> import ...` and plain `import a, b`.
    const fromRe = /^[ \t]*from[ \t]+((?:\.+)?[\w.]*)[ \t]+import\b/gm;
    let match: RegExpExecArray | null = fromRe.exec(stripped);
    while (match !== null) {
      const specifier = match[1];
      if (specifier !== undefined) modules.add(specifier);
      match = fromRe.exec(stripped);
    }

    const importRe = /^[ \t]*import[ \t]+([\w.]+(?:[ \t]*,[ \t]*[\w.]+)*)/gm;
    match = importRe.exec(stripped);
    while (match !== null) {
      const list = match[1] ?? '';
      for (const part of list.split(',')) {
        const specifier = part.trim();
        if (specifier.length > 0) modules.add(specifier);
      }
      match = importRe.exec(stripped);
    }

    // The names imported *from* a module — single-line (`from . import a, b
    // as c`) and parenthesized multi-line (`from pkg import (\n a,\n)`). A
    // name may be a submodule, so each one contributes its own candidates.
    const fromNamesLineRe = /^[ \t]*from[ \t]+((?:\.+)?[\w.]*)[ \t]+import[ \t]+(.+)$/gm;
    match = fromNamesLineRe.exec(stripped);
    while (match !== null) {
      const rest = (match[2] ?? '').trim();
      if (!rest.startsWith('(')) {
        fromImports.push({ module: match[1] ?? '', names: importedNames(rest) });
      }
      match = fromNamesLineRe.exec(stripped);
    }
    const fromNamesParenRe = /from[ \t]+((?:\.+)?[\w.]*)[ \t]+import[ \t]*\(([^)]*)\)/g;
    match = fromNamesParenRe.exec(stripped);
    while (match !== null) {
      fromImports.push({ module: match[1] ?? '', names: importedNames(match[2] ?? '') });
      match = fromNamesParenRe.exec(stripped);
    }

    const dir = nodePath.dirname(importerAbsolutePath);
    const out: ResolvedCandidate[] = [];

    for (const specifier of modules) {
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
        if (modulePath.length > 0) {
          addModuleCandidates(out, 'absolute', nodePath.join(startDir, modulePath));
        } else {
          // Bare dots name the importing file's package itself: only its
          // __init__.py is a meaningful candidate (a sibling <pkg>.py is not).
          out.push({ kind: 'absolute', path: nodePath.join(startDir, '__init__.py') });
        }
      } else {
        addModuleCandidates(out, 'root-relative', specifier.split('.').join('/'));
      }
    }

    for (const { module, names } of fromImports) {
      if (module === '__future__' || module.startsWith('__future__.')) continue;
      const dots = /^\.+/.exec(module)?.[0]?.length ?? 0;
      if (dots > 0) {
        let startDir = dir;
        for (let i = 1; i < dots; i += 1) startDir = nodePath.dirname(startDir);
        const modulePath = module
          .slice(dots)
          .split('.')
          .filter((s) => s.length > 0)
          .join('/');
        const base = modulePath.length > 0 ? nodePath.join(startDir, modulePath) : startDir;
        for (const name of names) {
          out.push({ kind: 'absolute', path: nodePath.join(base, `${name}.py`) });
          out.push({ kind: 'absolute', path: nodePath.join(base, name, '__init__.py') });
        }
      } else {
        const posixBase = module.split('.').join('/');
        for (const name of names) {
          out.push({ kind: 'root-relative', path: `${posixBase}/${name}.py` });
          out.push({ kind: 'root-relative', path: `${posixBase}/${name}/__init__.py` });
        }
      }
    }
    return out;
  }
}

/** The module file plus its package form — the two on-disk shapes a module can take. */
function addModuleCandidates(
  out: ResolvedCandidate[],
  kind: ResolvedCandidate['kind'],
  posixBase: string,
): void {
  out.push({ kind, path: `${posixBase}.py` });
  out.push({ kind, path: `${posixBase}/__init__.py` });
}

/**
 * First identifier of each comma-separated entry; an `as` alias suffix is
 * dropped (`x as y` contributes `x`). `import *` contributes nothing.
 */
function importedNames(raw: string): readonly string[] {
  const names: string[] = [];
  for (const part of raw.split(',')) {
    const name = /^\s*([A-Za-z_]\w*)/.exec(part)?.[1];
    if (name !== undefined) names.push(name);
  }
  return names;
}
