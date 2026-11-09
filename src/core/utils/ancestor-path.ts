/**
 * Pure path geometry for computing the import-containment boundary when no
 * workspace roots exist (ADR-0006): the deepest directory containing every
 * explicit input. Extracted from `bundle-builder.ts` so the drive/UNC/POSIX
 * parsing matrix — the site of both 1.0.2 release fixes — has its own
 * directly testable surface instead of being reachable only end-to-end.
 */

import * as nodePath from 'node:path';

interface AncestorPath {
  readonly kind: 'posix' | 'drive' | 'unc';
  /** Canonical root without its trailing separator (except POSIX `/`). */
  readonly root: string;
  readonly segments: readonly string[];
}

/**
 * Deepest directory containing every given path, or `undefined` when no
 * common ancestor exists (e.g. explicit inputs on different Windows
 * drives, in which case import following stays disabled). Inputs are
 * pre-reduced by the caller: files contribute their directory, directory
 * inputs contribute themselves. Roots are kept separate from ordinary
 * segments so an absolute POSIX path does not become relative when its
 * leading separator is normalized away. This is the containment boundary for
 * import candidates when the workspace has no roots (ADR-0006).
 */
export function commonAncestor(paths: readonly string[]): string | undefined {
  if (paths.length === 0) return undefined;

  const parsed = paths.map(parseAncestorPath);
  const first = parsed[0];
  if (first === undefined || !parsed.every((path) => path.root === first.root)) {
    return undefined;
  }

  const prefix: string[] = [];
  for (let i = 0; i < first.segments.length; i += 1) {
    const segment = first.segments[i];
    if (segment === undefined) break;
    if (!parsed.every((path) => path.segments[i] === segment)) break;
    prefix.push(segment);
  }

  // A shared filesystem root is not a useful containment boundary: returning
  // it would allow imports from every path on that volume/share.
  if (prefix.length === 0) return undefined;
  return formatAncestorPath(first, prefix);
}

function parseAncestorPath(input: string): AncestorPath {
  const normalizedInput = input.replace(/\\/g, '/');
  const isWindowsRootRelative =
    nodePath.sep === '\\' && normalizedInput.startsWith('/') && !normalizedInput.startsWith('//');
  const resolved =
    !isWindowsRootRelative && isAbsolutePathLike(normalizedInput)
      ? normalizedInput
      : nodePath.resolve(input).replace(/\\/g, '/');

  let unc: RegExpExecArray | null = null;
  if (nodePath.sep === '\\' || input.startsWith('\\\\')) {
    unc = /^\/\/([^/]+)\/([^/]+)(?:\/|$)/.exec(resolved);
  }
  if (unc !== null) {
    return {
      kind: 'unc',
      root: `//${unc[1]}/${unc[2]}`,
      segments: normalizeAncestorSegments(resolved.slice(unc[0].length)),
    };
  }

  const drive = /^([A-Za-z]:)(?:\/|$)/.exec(resolved);
  if (drive !== null) {
    return {
      kind: 'drive',
      root: drive[1] ?? '',
      segments: normalizeAncestorSegments(resolved.slice(drive[0].length)),
    };
  }

  if (resolved.startsWith('/')) {
    return {
      kind: 'posix',
      root: '/',
      segments: normalizeAncestorSegments(resolved.slice(1)),
    };
  }

  // `nodePath.resolve` above normally guarantees an absolute result. Keep a
  // defensive fallback so this helper cannot manufacture a relative boundary.
  return {
    kind: 'posix',
    root: '/',
    segments: normalizeAncestorSegments(resolved),
  };
}

function isAbsolutePathLike(path: string): boolean {
  return path.startsWith('/') || /^([A-Za-z]:)\//.test(path);
}

function normalizeAncestorSegments(path: string): string[] {
  const segments: string[] = [];
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments;
}

function formatAncestorPath(path: AncestorPath, segments: readonly string[]): string {
  if (path.kind === 'posix') return `/${segments.join('/')}`;
  const separator = nodePath.sep;
  const root = path.kind === 'unc' ? path.root.replace(/\//g, separator) : path.root;
  return `${root}${separator}${segments.join(separator)}`;
}
