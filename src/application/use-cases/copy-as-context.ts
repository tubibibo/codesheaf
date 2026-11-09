import type {
  BundleOptions,
  ContextBundle,
  InputRef,
  SkippedEntry,
} from '../../core/domain/bundle';
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
 *
 * The whole body — clipboard write and notifications included — lives in
 * one catch: command handlers invoke this as fire-and-forget (`void`), so
 * no rejection may ever escape and become an unhandled rejection the user
 * never sees.
 */
export async function copyAsContext(
  deps: CopyUseCaseDeps,
  refs: readonly InputRef[],
  overrides: CopyOverrides = {},
): Promise<CopyResult | undefined> {
  try {
    const options = resolveOptions(deps.config.getBundleOptions(), overrides);
    const bundle: ContextBundle = await deps.builder.build(refs, options);

    if (bundle.files.length === 0) {
      deps.notifier.showWarning(
        'CodeSheaf: nothing to copy — every candidate file was skipped (ignored, binary, too large, or unreadable).',
      );
      return undefined;
    }

    await deps.clipboard.writeText(bundle.rendered);
    const skippedNote = bundle.skipped.length > 0 ? ` (${bundle.skipped.length} skipped)` : '';
    deps.notifier.showInformation(
      `CodeSheaf: copied ${bundle.files.length} file(s) · ~${formatTokenCount(bundle.estimatedTokens)} tokens${skippedNote}`,
    );
    deps.logger.debug(`bundle: ${bundle.files.map((f) => f.path).join(', ')}`);
    if (bundle.skipped.length > 0) {
      // The toast only carries the count; the output channel is where each
      // skip and its reason stay inspectable (CONTRIBUTING promises this).
      deps.logger.info(`skipped: ${describeSkips(bundle.skipped)}`);
    }
    return {
      fileCount: bundle.files.length,
      estimatedTokens: bundle.estimatedTokens,
      skippedCount: bundle.skipped.length,
    };
  } catch (error) {
    const message = error instanceof BundleError ? error.message : describe(error);
    deps.logger.error(message);
    deps.notifier.showError(`CodeSheaf: ${message}`);
    return undefined;
  }
}

/** Merges configured options with per-command overrides. */
export function resolveOptions(base: BundleOptions, overrides: CopyOverrides): BundleOptions {
  if (overrides.ensureImportDepth === undefined) return base;
  return { ...base, maxImportDepth: Math.max(base.maxImportDepth, overrides.ensureImportDepth) };
}

/** How many skip entries are spelled out before the log switches to a count. */
const SKIP_LOG_LIMIT = 50;

/** `reason path, reason path, …` — truncated so huge directory picks stay sane. */
export function describeSkips(skipped: readonly SkippedEntry[]): string {
  const entries = skipped.map((entry) => `${entry.reason} ${entry.path}`);
  if (entries.length <= SKIP_LOG_LIMIT) return entries.join(', ');
  return `${entries.slice(0, SKIP_LOG_LIMIT).join(', ')} …and ${entries.length - SKIP_LOG_LIMIT} more`;
}

export function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
