import { Buffer } from 'node:buffer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VsCodeFileSystem } from '../../src/adapters/vscode/file-system.adapter';
import { hasUtf16BeBom } from '../../src/core/utils/binary';

const fs = vi.hoisted(() => ({ stat: vi.fn(), readFile: vi.fn() }));
vi.mock('vscode', () => ({
  Uri: { file: (fsPath: string) => ({ fsPath }) },
  workspace: { fs },
}));

describe('hasUtf16BeBom', () => {
  it('recognizes FE FF only and handles short buffers', () => {
    expect(hasUtf16BeBom(new Uint8Array([0xfe, 0xff, 0x00, 0x61]))).toBe(true);
    expect(hasUtf16BeBom(new Uint8Array([0xff, 0xfe, 0x61, 0x00]))).toBe(false);
    expect(hasUtf16BeBom(new Uint8Array([0xfe]))).toBe(false);
    expect(hasUtf16BeBom(new Uint8Array())).toBe(false);
  });
});

describe('VsCodeFileSystem text decoding', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    fs.stat.mockResolvedValue({ size: 0 });
  });

  const text = 'hello 汉字 😀\n';
  it.each([
    ['UTF-8', Buffer.from(text, 'utf8')],
    ['UTF-16LE', Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')])],
    ['UTF-16BE', Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(text, 'utf16le').swap16()])],
  ])('decodes %s source through the actual adapter', async (_encoding, bytes) => {
    fs.readFile.mockResolvedValue(bytes);
    expect(await new VsCodeFileSystem().readText('/source.txt', 1024)).toEqual({
      ok: true,
      content: text,
    });
  });

  it('decodes UTF-16BE even when the payload contains no NUL bytes', async () => {
    fs.readFile.mockResolvedValue(new Uint8Array([0xfe, 0xff, 0x65, 0x87, 0x67, 0x2c]));
    expect(await new VsCodeFileSystem().readText('/source.txt', 1024)).toEqual({
      ok: true,
      content: '文本',
    });
  });

  it('decodes an empty UTF-16BE document and strips its BOM', async () => {
    fs.readFile.mockResolvedValue(new Uint8Array([0xfe, 0xff]));
    expect(await new VsCodeFileSystem().readText('/empty.txt', 1024)).toEqual({
      ok: true,
      content: '',
    });
  });

  it('keeps rejecting NUL-containing data without a UTF-16 BOM', async () => {
    fs.readFile.mockResolvedValue(new Uint8Array([0x61, 0, 0x62]));
    expect(await new VsCodeFileSystem().readText('/binary.txt', 1024)).toEqual({
      ok: false,
      reason: 'binary',
    });
  });

  it('enforces the byte limit before reading an encoded document', async () => {
    fs.stat.mockResolvedValue({ size: 1025 });
    expect(await new VsCodeFileSystem().readText('/large.txt', 1024)).toEqual({
      ok: false,
      reason: 'too-large',
    });
    expect(fs.readFile).not.toHaveBeenCalled();
  });
});
