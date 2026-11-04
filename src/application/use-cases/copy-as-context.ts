import type { BundleOptions, ContextBundle, InputRef } from '../../core/domain/bundle';
import { BundleError } from '../../core/domain/errors';
import type { ClipboardPort, ConfigPort, LoggerPort, NotificationPort } from '../../core/ports';
import type { BundleBuilder } from '../../core/services/bundle-builder';
import { formatTokenCount } from '../../core/utils/format';

export interface CopyUseCaseDeps {
  readonly builder: BundleBuilder;
  readonly config: ConfigPort;
  readonly clipboard: ClipboardPort;
  readonly notifier: NotificationPort;
  readonly logger: LoggerPort;
}

export interface CopyOverrides {
  /** Ensure the import closure is followed at least this deep (used by the "+ imports" command). */
  readonly ensureImportDepth?: number;
}

export interface CopyResult {
  readonly fileCount: number;
  readonly estimatedTokens: number;
  readonly skippedCount: number;
}

/**
 * Use case: weave the given inputs into a bundle and copy the rendered
 * text to the clipboard. Returns `undefined` when the user was already
 * notified about an empty or failed bundle.
 */
export async function copyAsContext(
  deps: CopyUseCaseDeps,
  refs: readonly InputRef[],
  overrides: CopyOverrides = {},
): Promise<CopyResult | undefined> {
  const options = resolveOptions(deps.config.getBundleOptions(), overrides);
  let bundle: ContextBundle;
  try {
    bundle = await deps.builder.build(refs, options);
  } catch (error) {
    const message =
      error instanceof BundleError ? error.message : `Failed to weave bundle: ${describe(error)}`;
    deps.logger.error(message);
    deps.notifier.showError(`CodeSheaf: ${message}`);
    return undefined;
  }

  if (bundle.files.length === 0) {
    deps.notifier.showWarning(
      'CodeSheaf: nothing to copy — every candidate file was skipped (ignored, binary, too large, or empty).',
    );
    return undefined;
  }

  await deps.clipboard.writeText(bundle.rendered);
  const skippedNote = bundle.skipped.length > 0 ? ` (${bundle.skipped.length} skipped)` : '';
  deps.notifier.showInformation(
    `CodeSheaf: copied ${bundle.files.length} file(s) · ~${formatTokenCount(bundle.estimatedTokens)} tokens${skippedNote}`,
  );
  deps.logger.debug(`bundle: ${bundle.files.map((f) => f.path).join(', ')}`);
  return {
    fileCount: bundle.files.length,
    estimatedTokens: bundle.estimatedTokens,
    skippedCount: bundle.skipped.length,
  };
}

/** Merges configured options with per-command overrides. */
export function resolveOptions(base: BundleOptions, overrides: CopyOverrides): BundleOptions {
  if (overrides.ensureImportDepth === undefined) return base;
  return { ...base, maxImportDepth: Math.max(base.maxImportDepth, overrides.ensureImportDepth) };
}

export function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
