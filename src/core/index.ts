/**
 * Public surface of the platform-agnostic core.
 * Nothing under `src/core` may import `vscode` or `src/adapters` — this
 * barrel is what application use cases and tests are allowed to consume.
 */
export * from './domain';
export * from './ports';

export {
  BundleBuilder,
  MAX_DIRECTORY_FILES,
  type BundleBuilderDeps,
} from './services/bundle-builder';
export { renderBundle, type RenderInput } from './services/formatter';
export { estimateTokens, isCjkCodePoint } from './services/token-estimator';
export { renderFileTree } from './services/tree-renderer';
export { IgnoreMatcher } from './services/ignore/gitignore-matcher';
export {
  ImportScannerService,
  type ImportLanguageStrategy,
  type ImportScanInput,
  type ResolvedCandidate,
} from './services/scan/import-scanner';
export { BUILT_IN_STRATEGIES } from './services/scan/strategies';
export * from './utils';
