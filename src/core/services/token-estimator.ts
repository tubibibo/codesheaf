/**
 * Heuristic token estimator.
 *
 * Roughly models modern BPE tokenizers: 4 ASCII characters ≈ 1 token, while
 * CJK characters (Chinese/Japanese/Korean) consume close to one token each.
 * This is intentionally an *estimate* for a status-bar readout and bundle
 * headers — never an exact count (see ADR-0004).
 */

const CJK_RANGES: readonly (readonly [number, number])[] = [
  [0x2e80, 0x9fff], // CJK radicals, kana, CJK unified ideographs
  [0x3040, 0x30ff], // hiragana + katakana (overlaps above, kept for clarity)
  [0xac00, 0xd7af], // hangul syllables
  [0xf900, 0xfaff], // CJK compatibility ideographs
  [0xff00, 0xffef], // fullwidth forms
];

export function isCjkCodePoint(codePoint: number): boolean {
  return CJK_RANGES.some(([lo, hi]) => codePoint >= lo && codePoint <= hi);
}

export function estimateTokens(text: string): number {
  let other = 0;
  let cjk = 0;
  for (const ch of text) {
    const codePoint = ch.codePointAt(0);
    if (codePoint !== undefined && isCjkCodePoint(codePoint)) cjk += 1;
    else other += 1;
  }
  return Math.ceil(other / 4) + cjk;
}
