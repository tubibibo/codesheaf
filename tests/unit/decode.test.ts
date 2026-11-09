import { describe, expect, it } from 'vitest';
import { decodeUtf16ByBom, decodeUtf8Strict } from '../../src/core/utils/decode';
import { InMemoryFileSystem } from '../support/fake-fs';

function utf16leBytes(text: string): Uint8Array {
  const bytes = new Uint8Array(2 + text.length * 2);
  bytes[0] = 0xff;
  bytes[1] = 0xfe;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    bytes[2 + i * 2] = code & 0xff;
    bytes[3 + i * 2] = code >> 8;
  }
  return bytes;
}

function utf16beBytes(text: string): Uint8Array {
  const bytes = new Uint8Array(2 + text.length * 2);
  bytes[0] = 0xfe;
  bytes[1] = 0xff;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    bytes[2 + i * 2] = code >> 8;
    bytes[3 + i * 2] = code & 0xff;
  }
  return bytes;
}

describe('decodeUtf16ByBom', () => {
  it('decodes UTF-16LE content by its BOM', () => {
    expect(decodeUtf16ByBom(utf16leBytes('héllo 中'))).toBe('héllo 中');
  });

  it('decodes UTF-16BE content by its BOM', () => {
    expect(decodeUtf16ByBom(utf16beBytes('héllo 中'))).toBe('héllo 中');
  });

  it('returns undefined when there is no UTF-16 BOM', () => {
    expect(decodeUtf16ByBom(new TextEncoder().encode('plain'))).toBeUndefined();
  });
});

describe('decodeUtf8Strict', () => {
  it('decodes valid UTF-8 including multibyte characters', () => {
    const bytes = new TextEncoder().encode('const greeting = "你好"; // héllo');
    expect(decodeUtf8Strict(bytes)).toEqual({
      ok: true,
      content: 'const greeting = "你好"; // héllo',
    });
  });

  it('rejects invalid sequences as an encoding error instead of U+FFFD', () => {
    // GBK-encoded 中 (D6 D0) is not valid UTF-8.
    expect(decodeUtf8Strict(new Uint8Array([0xd6, 0xd0]))).toEqual({
      ok: false,
      reason: 'encoding',
    });
  });

  it('rejects a truncated multibyte sequence at the end of input', () => {
    expect(decodeUtf8Strict(new Uint8Array([0x61, 0xc3]))).toEqual({
      ok: false,
      reason: 'encoding',
    });
  });

  it('rejects a continuation byte in leader position', () => {
    expect(decodeUtf8Strict(new Uint8Array([0xc3, 0x28]))).toEqual({
      ok: false,
      reason: 'encoding',
    });
  });
});

describe('InMemoryFileSystem byte fixtures', () => {
  it('skips byte fixtures with invalid UTF-8 as encoding failures', async () => {
    const fs = new InMemoryFileSystem({ '/proj/legacy-gbk.txt': new Uint8Array([0xd6, 0xd0]) });
    await expect(fs.readText('/proj/legacy-gbk.txt', 1024)).resolves.toEqual({
      ok: false,
      reason: 'encoding',
    });
  });

  it('decodes UTF-16 byte fixtures by BOM', async () => {
    const fs = new InMemoryFileSystem({ '/proj/utf16.txt': utf16leBytes('export const x = 1;') });
    await expect(fs.readText('/proj/utf16.txt', 1024)).resolves.toEqual({
      ok: true,
      content: 'export const x = 1;',
    });
  });

  it('keeps string fixtures decoding unchanged', async () => {
    const fs = new InMemoryFileSystem({ '/proj/a.ts': 'export const y = 2;' });
    await expect(fs.readText('/proj/a.ts', 1024)).resolves.toEqual({
      ok: true,
      content: 'export const y = 2;',
    });
  });
});
