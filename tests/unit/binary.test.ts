import { describe, expect, it } from 'vitest';
import { hasUtf16LeBom, isBinaryExtension, isProbablyBinary } from '../../src/core/utils/binary';

describe('isBinaryExtension', () => {
  it('flags known binary formats and ignores text ones', () => {
    expect(isBinaryExtension('C:/proj/logo.png')).toBe(true);
    expect(isBinaryExtension('C:/proj/archive.tar.gz')).toBe(true);
    expect(isBinaryExtension('C:/proj/font.woff2')).toBe(true);
    expect(isBinaryExtension('C:/proj/src/a.ts')).toBe(false);
    expect(isBinaryExtension('C:/proj/README')).toBe(false);
    expect(isBinaryExtension('C:/proj/a.b/c')).toBe(false); // dot in a folder name
  });
});

describe('hasUtf16LeBom', () => {
  it('detects the FF FE BOM and nothing else', () => {
    expect(hasUtf16LeBom(new Uint8Array([0xff, 0xfe, 0x61, 0x00]))).toBe(true);
    expect(hasUtf16LeBom(new Uint8Array([0xfe, 0xff, 0x00, 0x61]))).toBe(false); // UTF-16BE
    expect(hasUtf16LeBom(new Uint8Array([0x61, 0x62]))).toBe(false);
    expect(hasUtf16LeBom(new Uint8Array([0xff]))).toBe(false);
  });
});

describe('isProbablyBinary', () => {
  it('still flags NUL bytes outside of UTF-16 files', () => {
    expect(isProbablyBinary(new Uint8Array([0x61, 0x00, 0x62]))).toBe(true);
    expect(isProbablyBinary(new Uint8Array([0x61, 0x62, 0x63]))).toBe(false);
  });
});
