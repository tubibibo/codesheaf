import * as nodePath from 'node:path';
import type { ResolvedCandidate } from './import-scanner';

/**
 * Expands a base path into candidate paths: the exact path, then the given
 * extensions, then `index` variants — the resolution order used by Node/TS
 * style module systems.
 */
export function absoluteCandidates(
  base: string,
  extensions: readonly string[],
): ResolvedCandidate[] {
  const out: ResolvedCandidate[] = [];
  for (const ext of ['', ...extensions]) {
    out.push({ kind: 'absolute', path: base + ext });
  }
  for (const ext of extensions) {
    out.push({ kind: 'absolute', path: nodePath.join(base, `index${ext}`) });
  }
  return out;
}
