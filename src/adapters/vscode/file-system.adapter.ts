import { realpath } from 'node:fs/promises';
import * as vscode from 'vscode';
import type { DirectoryEntry, FileReadResult, FileSystemPort } from '../../core/ports';
import { isBinaryExtension, isProbablyBinary } from '../../core/utils/binary';
import { decodeUtf16ByBom, decodeUtf8Strict } from '../../core/utils/decode';

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
      const utf16 = decodeUtf16ByBom(bytes);
      if (utf16 !== undefined) return { ok: true, content: utf16 };
      if (isProbablyBinary(bytes) || isBinaryExtension(absolutePath)) {
        return { ok: false, reason: 'binary' };
      }
      // Strict UTF-8: invalid sequences are an explicit `encoding` skip
      // instead of silent U+FFFD mojibake woven into the bundle.
      return decodeUtf8Strict(bytes);
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
