import { describe, expect, it } from 'vitest';
import { estimateTokens, isCjkCodePoint } from '../../src/core/services/token-estimator';

describe('estimateTokens', () => {
  it('estimates 4 ASCII characters as ~1 token', () => {
    expect(estimateTokens('hello world')).toBe(3); // ceil(11 / 4)
  });

  it('returns 0 for empty text', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('counts CJK characters as ~1 token each', () => {
    expect(estimateTokens('你好世界')).toBe(4);
  });

  it('mixes ASCII and CJK linearly', () => {
    expect(estimateTokens('abc你好')).toBe(3); // ceil(3 / 4) + 2
  });

  it('treats emoji as ordinary non-CJK characters', () => {
    expect(estimateTokens('😀')).toBe(1);
  });

  it('counts whitespace and newlines', () => {
    expect(estimateTokens('\n')).toBe(1);
    expect(estimateTokens('a\nb\nc\nd\ne\nf\ng\nh\n')).toBe(4); // ceil(16 / 4)
  });
});

describe('isCjkCodePoint', () => {
  it('recognizes Han, kana and hangul ranges', () => {
    expect(isCjkCodePoint(0x4e2d)).toBe(true); // 中
    expect(isCjkCodePoint(0x3042)).toBe(true); // あ
    expect(isCjkCodePoint(0xac00)).toBe(true); // 가
    expect(isCjkCodePoint(0x0041)).toBe(false); // A
    expect(isCjkCodePoint(0x1f600)).toBe(false); // emoji
  });
});
