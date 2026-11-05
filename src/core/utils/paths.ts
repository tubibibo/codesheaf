/** True when any path segment is exactly `..` (traversal, not a name). */
export function hasDotDotSegment(path: string): boolean {
  return path
    .replace(/\\/g, '/')
    .split('/')
    .some((segment) => segment === '..');
}

/**
 * Deterministic name comparator: case-insensitive first (so `a` sorts
 * before `B` on every platform and locale), then by code point to break
 * ties. Replaces `localeCompare`, whose order varies with the host locale.
 */
export function compareNames(a: string, b: string): number {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la !== lb) return la < lb ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Normalizes an absolute path into a stable deduplication key. Windows paths
 * are case-insensitive and may mix separators, so they are lower-cased and
 * slash-normalized; POSIX paths keep their case.
 */
export function dedupeKey(absolutePath: string): string {
  const normalized = absolutePath.replace(/\\/g, '/');
  const isWindowsPath = /^[a-zA-Z]:\//.test(normalized) || normalized.startsWith('//');
  const isWindowsHost = typeof process !== 'undefined' && process.platform === 'win32';
  return isWindowsPath || isWindowsHost ? normalized.toLowerCase() : normalized;
}
