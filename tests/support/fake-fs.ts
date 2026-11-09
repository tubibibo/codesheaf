import { Buffer } from 'node:buffer';
import type {
  DirectoryEntry,
  FileReadResult,
  FileSystemPort,
  WorkspacePort,
} from '../../src/core/ports';
import { isProbablyBinary } from '../../src/core/utils/binary';
import { decodeUtf16ByBom, decodeUtf8Strict } from '../../src/core/utils/decode';

/** Normalizes test paths so the same fixtures work on Windows and Linux. */
export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Absolute project root for fixtures. It must be absolute for the *host's*
 * `node:path`, or strategies would resolve relative specifiers against cwd:
 * `C:/proj` on Windows, `/proj` on POSIX.
 */
const DRIVE = process.platform === 'win32' ? 'C:' : '';
export const PROJECT_ROOT = `${DRIVE}/proj`;

/** A sibling of PROJECT_ROOT, used to prove import containment. */
export const OUTSIDE_ROOT = `${DRIVE}/outside`;

/** A fixture file: text, or raw bytes (to model non-UTF-8 disk content). */
export type FakeFileContent = string | Uint8Array;

/**
 * In-memory FileSystemPort. Keys are absolute POSIX-style paths under
 * PROJECT_ROOT (e.g. `/proj/src/a.ts`, `C:/proj/src/a.ts` on Windows).
 * Byte fixtures follow the same decoding rules as the production adapter:
 * UTF-16 BOMs decode, NUL bytes are binary, and invalid UTF-8 is an
 * `encoding` skip rather than silent U+FFFD replacement.
 */
export class InMemoryFileSystem implements FileSystemPort {
  private readonly files: ReadonlyMap<string, FakeFileContent>;

  constructor(files: Readonly<Record<string, FakeFileContent>>) {
    this.files = new Map(Object.entries(files).map(([key, value]) => [normalizePath(key), value]));
  }

  async exists(absolutePath: string): Promise<boolean> {
    return this.files.has(normalizePath(absolutePath));
  }

  async realPath(absolutePath: string): Promise<string | undefined> {
    const key = normalizePath(absolutePath);
    return this.files.has(key) ? key : undefined;
  }

  async readText(absolutePath: string, maxBytes: number): Promise<FileReadResult> {
    const value = this.files.get(normalizePath(absolutePath));
    if (value === undefined) return { ok: false, reason: 'not-found' };
    const bytes =
      typeof value === 'string' ? Buffer.from(value, 'utf-8') : Buffer.from(value.buffer);
    if (bytes.byteLength > maxBytes) return { ok: false, reason: 'too-large' };
    const utf16 = decodeUtf16ByBom(bytes);
    if (utf16 !== undefined) return { ok: true, content: utf16 };
    if (isProbablyBinary(bytes)) return { ok: false, reason: 'binary' };
    const decoded = decodeUtf8Strict(bytes);
    return decoded.ok ? { ok: true, content: decoded.content } : { ok: false, reason: 'encoding' };
  }

  async listDir(absoluteDir: string): Promise<readonly DirectoryEntry[]> {
    const dir = normalizePath(absoluteDir).replace(/\/+$/, '');
    const prefix = `${dir}/`;
    const directories = new Set<string>();
    const fileNames: string[] = [];
    for (const path of this.files.keys()) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      const slash = rest.indexOf('/');
      if (slash === -1) fileNames.push(rest);
      else directories.add(rest.slice(0, slash));
    }
    return [
      ...[...directories].sort().map<DirectoryEntry>((name) => ({ name, isDirectory: true })),
      ...fileNames.sort().map<DirectoryEntry>((name) => ({ name, isDirectory: false })),
    ];
  }
}

/**
 * In-memory WorkspacePort over POSIX-style absolute paths. Accepts a single
 * root or several (multi-root fixtures).
 */
export class InMemoryWorkspace implements WorkspacePort {
  private readonly rootList: readonly string[];

  constructor(roots: string | readonly string[]) {
    this.rootList = (typeof roots === 'string' ? [roots] : roots).map((root) =>
      normalizePath(root).replace(/\/+$/, ''),
    );
  }

  roots(): readonly string[] {
    return this.rootList;
  }

  rootFor(absolutePath: string): string | undefined {
    const path = normalizePath(absolutePath);
    return this.rootList.find((root) => path === root || path.startsWith(`${root}/`));
  }

  relativePath(absolutePath: string): string | undefined {
    const root = this.rootFor(absolutePath);
    if (root === undefined) return undefined;
    const path = normalizePath(absolutePath);
    if (path === root) return '';
    return path.slice(root.length + 1);
  }
}
