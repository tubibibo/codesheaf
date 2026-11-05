import { BundleBuilder } from '../../src/core/services/bundle-builder';
import { ImportScannerService } from '../../src/core/services/scan/import-scanner';
import { BUILT_IN_STRATEGIES } from '../../src/core/services/scan/strategies';
import { InMemoryFileSystem, InMemoryWorkspace, PROJECT_ROOT } from './fake-fs';

/** Wires a real BundleBuilder over an in-memory file system. */
export function makeBuilder(
  files: Readonly<Record<string, string>>,
  root: string | readonly string[] = PROJECT_ROOT,
): { builder: BundleBuilder; fs: InMemoryFileSystem; workspace: InMemoryWorkspace } {
  const fs = new InMemoryFileSystem(files);
  const workspace = new InMemoryWorkspace(root);
  const scanner = new ImportScannerService(BUILT_IN_STRATEGIES);
  return { builder: new BundleBuilder({ workspace, fs, scanner }), fs, workspace };
}
