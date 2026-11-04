/**
 * Heuristic binary sniffing: any NUL byte in the first 8 KiB marks the file
 * as binary. Cheap, dependency-free, and right in practice for the formats
 * developers bundle (source code, configs, text).
 */
export function isProbablyBinary(bytes: Uint8Array): boolean {
  const sampleEnd = Math.min(bytes.length, 8192);
  for (let i = 0; i < sampleEnd; i += 1) {
    if (bytes[i] === 0) return true;
  }
  return false;
}
