import type {
  BundleFormat,
  BundleOptions,
  BundledFile,
  ContextBundle,
  InputRef,
  SkippedEntry,
} from '../../core/domain/bundle';
import { BundleError } from '../../core/domain/errors';
import type { ClipboardPort, ConfigPort, LoggerPort, NotificationPort } from '../../core/ports';
import type { BundleBuilder } from '../../core/services/bundle-builder';
import { scanText, type SecretFinding } from '../../core/services/secret-scanner';
import { capRows, formatTokenCount } from '../../core/utils/format';

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
  /** Render this bundle in a specific format instead of the configured one (choose-format command). */
  readonly format?: BundleFormat;
}

export interface CopyResult {
  readonly fileCount: number;
  readonly estimatedTokens: number;
  readonly skippedCount: number;
}

/**
 * The one action that lets a flagged bundle through. The confirm port
 * resolves action *labels*, so this constant is the single place where the
 * button text doubles as behavior (review fix R9): any other return value —
 * including `undefined` from a dismissed dialog — cancels the copy.
 */
const COPY_ANYWAY_ACTION = 'Copy anyway';

/**
 * Use case: weave the given inputs into a bundle and copy the rendered
 * text to the clipboard. Returns `undefined` when the user was already
 * notified about an empty or failed bundle — or when the secret-scan
 * confirmation (ADR-0008) was dismissed, in which case nothing is copied.
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

    // Warn flow (ADR-0008): the scan never blocks silently — it stands one
    // modal question between a flagged bundle and the clipboard.
    if (options.secretScan === 'warn') {
      const findings = collectSecretFindings(bundle.files);
      if (findings.length > 0) {
        // Logged before the question, on every path (review fix R5): the
        // output channel keeps each finding inspectable whether the user
        // proceeds, cancels, or dismisses the dialog.
        deps.logger.warn(`secret findings: ${describeSecretFindings(findings)}`);
        const choice = await deps.notifier.confirm(
          `CodeSheaf: ${summarizeSecretFindings(findings, 'bundle')}. Copy anyway?`,
          [COPY_ANYWAY_ACTION, 'Cancel'],
        );
        if (choice !== COPY_ANYWAY_ACTION) {
          deps.notifier.showWarning(
            'CodeSheaf: nothing was copied. Run Preview Context Bundle to inspect the flagged lines first.',
          );
          return undefined;
        }
      }
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
  let options = base;
  if (overrides.ensureImportDepth !== undefined) {
    options = {
      ...options,
      maxImportDepth: Math.max(options.maxImportDepth, overrides.ensureImportDepth),
    };
  }
  if (overrides.format !== undefined) {
    // Only a validated enum member reaches here (the command handler picks
    // from a fixed list); the override wins over `codesheaf.format`.
    options = { ...options, format: overrides.format };
  }
  return options;
}

/** How many entries are spelled out before a log line switches to a count. */
const LOG_LIMIT = 50;

/** `reason path, reason path, …` — capped so huge directory picks stay sane. */
export function describeSkips(skipped: readonly SkippedEntry[]): string {
  return describeCapped(
    skipped.map((entry) => `${entry.reason} ${entry.path}`),
    LOG_LIMIT,
  );
}

/** A {@link SecretFinding} pinned to the bundle file it came from. */
export interface SecretFileFinding extends SecretFinding {
  readonly path: string;
}

/** Scans every bundled file and aggregates the findings in bundle order. */
export function collectSecretFindings(files: readonly BundledFile[]): SecretFileFinding[] {
  const findings: SecretFileFinding[] = [];
  for (const file of files) {
    for (const finding of scanText(file.content)) {
      findings.push({ ...finding, path: file.path });
    }
  }
  return findings;
}

/**
 * `N possible secret(s) in this <where> (labels; first: path:line)` — the
 * shared core of the copy confirmation and the preview warning. Never
 * includes the matched content itself (ADR-0008).
 */
export function summarizeSecretFindings(
  findings: readonly SecretFileFinding[],
  where: 'bundle' | 'preview',
): string {
  const labels = [...new Set(findings.map((f) => f.label))].join(', ');
  const first = findings[0];
  const at = first === undefined ? '?' : `${first.path}:${first.line}`;
  return `${findings.length} possible secret(s) in this ${where} (${labels}; first: ${at})`;
}

/** `path:line ruleId, …` — same detail style (and cap) as {@link describeSkips}. */
export function describeSecretFindings(findings: readonly SecretFileFinding[]): string {
  return describeCapped(
    findings.map((finding) => `${finding.path}:${finding.line} ${finding.ruleId}`),
    LOG_LIMIT,
  );
}

/** Joins capped detail rows: the first `limit` entries, then a total count. */
function describeCapped(entries: readonly string[], limit: number): string {
  const capped = capRows(entries, limit);
  if (capped.hidden === 0) return capped.rows.join(', ');
  return `${capped.rows.join(', ')} …and ${capped.hidden} more`;
}

export function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
