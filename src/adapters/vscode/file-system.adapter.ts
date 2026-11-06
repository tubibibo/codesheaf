import { realpath } from 'node:fs/promises';
import * as vscode from 'vscode';
import type { DirectoryEntry, FileReadResult, FileSystemPort } from '../../core/ports';
import {
  hasUtf16BeBom,
  hasUtf16LeBom,
  isBinaryExtension,
  isProbablyBinary,
} from '../../core/utils/binary';

const BINARY_SNIFF_BYTES = 8192;

/** Adapter: VS Code virtual file system -> {@link FileSystemPort}. */
export class VsCodeFileSystem implements FileSystemPort {
  async exists(absolutePath: string): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(absolutePath));
      return true;
    } catch {
      return false;
    }
  }

  async realPath(absolutePath: string): Promise<string | undefined> {
    try {
      return await realpath(absolutePath);
    } catch {
      return undefined;
    }
  }

  async readText(absolutePath: string, maxBytes: number): Promise<FileReadResult> {
    const uri = vscode.Uri.file(absolutePath);
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.size > maxBytes) return { ok: false, reason: 'too-large' };
    } catch {
      return { ok: false, reason: 'not-found' };
    }
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      // UTF-16 text is NUL-interleaved but genuinely text: decode it
      // before the NUL sniff ever gets a chance to call it binary.
      if (hasUtf16LeBom(bytes)) {
        return { ok: true, content: new TextDecoder('utf-16le').decode(bytes) };
      }
      if (hasUtf16BeBom(bytes)) {
        return { ok: true, content: new TextDecoder('utf-16be').decode(bytes) };
      }
      if (isProbablyBinary(bytes) || isBinaryExtension(absolutePath)) {
        return { ok: false, reason: 'binary' };
      }
      return { ok: true, content: new TextDecoder('utf-8').decode(bytes) };
    } catch {
      return { ok: false, reason: 'unreadable' };
    }
  }

  async listDir(absoluteDir: string): Promise<readonly DirectoryEntry[]> {
    const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(absoluteDir));
    return entries.map(([name, fileType]) => ({
      name,
      isDirectory: (fileType & vscode.FileType.Directory) !== 0,
    }));
  }
}

/** Re-exported for tests that want to exercise the same sniffing rule. */
export { BINARY_SNIFF_BYTES };
