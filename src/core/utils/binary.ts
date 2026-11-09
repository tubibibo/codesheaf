/**
 * Heuristic binary sniffing. Cheap, dependency-free, and right in practice
 * for the formats developers bundle (source code, configs, text).
 */

/** Known binary file extensions — a cheap first line that NUL sniffing misses. */
const BINARY_EXTENSIONS: ReadonlySet<string> = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.bmp',
  '.tiff',
  '.tif',
  '.pdf',
  '.zip',
  '.gz',
  '.tgz',
  '.bz2',
  '.xz',
  '.7z',
  '.rar',
  '.jar',
  '.war',
  '.class',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.dat',
  '.o',
  '.a',
  '.obj',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',
  '.mp3',
  '.mp4',
  '.avi',
  '.mov',
  '.mkv',
  '.wav',
  '.flac',
  '.ogg',
  '.webm',
  '.sqlite',
  '.db',
  '.psd',
  '.ai',
  '.sketch',
  '.xlsx',
  '.docx',
  '.pptx',
]);

/** True when the extension alone marks the file as binary. */
export function isBinaryExtension(absolutePath: string): boolean {
  const normalized = absolutePath.replace(/\\/g, '/');
  const dot = normalized.lastIndexOf('.');
  const slash = normalized.lastIndexOf('/');
  if (dot === -1 || dot < slash) return false;
  return BINARY_EXTENSIONS.has(normalized.slice(dot).toLowerCase());
}

/** True when the buffer starts with a UTF-16 little-endian BOM (FF FE). */
export function hasUtf16LeBom(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe;
}

/** True when the buffer starts with a UTF-16 big-endian BOM (FE FF). */
export function hasUtf16BeBom(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff;
}

/**
 * How many leading bytes the NUL sniff inspects. The UTF-16 BOM checks in
 * {@link decodeUtf16ByBom} must run *before* this sniff — the contract is
 * documented here so the ordering never drifts.
 */
export const BINARY_SNIFF_BYTES = 8192;

/**
 * Any NUL byte in the first {@link BINARY_SNIFF_BYTES} bytes marks the file as
 * binary. UTF-16 files (NUL-interleaved but genuinely text) must be checked
 * via {@link hasUtf16LeBom} or {@link hasUtf16BeBom} *before* consulting
 * this function.
 */
export function isProbablyBinary(bytes: Uint8Array): boolean {
  const sampleEnd = Math.min(bytes.length, BINARY_SNIFF_BYTES);
  for (let i = 0; i < sampleEnd; i += 1) {
    if (bytes[i] === 0) return true;
  }
  return false;
}
