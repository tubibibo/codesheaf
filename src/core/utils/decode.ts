/**
 * Text decoding for file bytes, shared by the VS Code adapter and the
 * in-memory test fake so both fail identically.
 *
 * UTF-16 text is NUL-interleaved but genuinely text: it must be decoded
 * before the NUL sniff ever gets a chance to call it binary. UTF-8 is
 * decoded *strictly* — invalid sequences would otherwise be silently
 * replaced with U+FFFD and woven into the bundle as mojibake (audit
 * finding CS-P3-05); such files are now reported as `encoding` skips.
 */

import { hasUtf16BeBom, hasUtf16LeBom, isProbablyBinary } from './binary';

/** Decodes UTF-16LE/BE content by BOM; `undefined` when there is no UTF-16 BOM. */
export function decodeUtf16ByBom(bytes: Uint8Array): string | undefined {
  if (hasUtf16LeBom(bytes)) return new TextDecoder('utf-16le').decode(bytes);
  if (hasUtf16BeBom(bytes)) return new TextDecoder('utf-16be').decode(bytes);
  return undefined;
}

export type Utf8DecodeResult = { ok: true; content: string } | { ok: false; reason: 'encoding' };

/** Strictly decodes UTF-8; invalid sequences are an `encoding` error, not U+FFFD. */
export function decodeUtf8Strict(bytes: Uint8Array): Utf8DecodeResult {
  try {
    return { ok: true, content: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, reason: 'encoding' };
  }
}

export { isProbablyBinary };
