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
