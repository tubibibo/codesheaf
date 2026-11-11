import * as nodePath from 'node:path';
import { stripCStyleComments } from '../../utils/text';

/**
 * tsconfig `paths` alias parsing and matching for import following
 * (ADR-0009). Pure functions: no file IO, so the bundle builder stays in
 * control of when and where a tsconfig is read.
 *
 * Deliberately supported: literal patterns (`@utils`) and single-star
 * patterns (`@/*`) — the whole grammar a tsconfig allows — plus `baseUrl`
 * (the mapping base directory defaults to the tsconfig's own directory, the
 * TypeScript 4.1+ semantics). Deliberately unsupported: the `extends` chain
 * and nested tsconfigs; only the workspace root's own tsconfig.json is read.
 */

/** One parsed `paths` key and its raw (not yet resolved) target values. */
interface AliasPattern {
  readonly pattern: string;
  readonly targets: readonly string[];
}

/** Parsed alias table for one tsconfig.json, ready for {@link matchAlias}. */
export interface TsconfigAliasMap {
  /** Directory every target resolves against: `baseUrl` when set, else the tsconfig directory. */
  readonly baseDir: string;
  /** `paths` entries in tsconfig order (JSON.parse preserves key order). */
  readonly patterns: readonly AliasPattern[];
}

/**
 * Parses a tsconfig.json text into an alias table. Real-world tsconfigs are
 * JSONC, so C-style comments go through the existing string-aware stripper
 * first and trailing commas get a second, string-aware pass before a retry.
 * Anything that still fails to parse (or has no usable `paths` object)
 * returns `undefined` — the caller keeps the previous skip-the-alias
 * behavior instead of failing the bundle.
 *
 * The `extends` chain is not followed by design (ADR-0009): a shared base
 * tsconfig's `paths` are invisible here.
 */
export function parseTsconfigAliases(
  text: string,
  tsconfigDir: string,
): TsconfigAliasMap | undefined {
  const cleaned = stripCStyleComments(stripBom(text));
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    try {
      parsed = JSON.parse(stripTrailingCommas(cleaned));
    } catch {
      return undefined;
    }
  }
  const options = isPlainObject(parsed)
    ? (parsed as { compilerOptions?: unknown }).compilerOptions
    : undefined;
  if (!isPlainObject(options)) return undefined;
  const rawPaths = (options as { paths?: unknown }).paths;
  if (!isPlainObject(rawPaths)) return undefined;

  const patterns: AliasPattern[] = [];
  for (const [pattern, targets] of Object.entries(rawPaths)) {
    if (!Array.isArray(targets)) continue;
    const strings = targets.filter((target): target is string => typeof target === 'string');
    if (strings.length > 0) patterns.push({ pattern, targets: strings });
  }
  // tsc resolves a specifier against `paths` by specificity, not declaration
  // order: the pattern with the longest literal prefix before its `*` wins
  // (TypeScript's comparePatternKeys). Mirror that with a stable sort so
  // `@/special/*` beats `@/*` regardless of key order (review fix R3).
  patterns.sort((a, b) => specificity(b.pattern) - specificity(a.pattern));
  const rawBaseUrl = (options as { baseUrl?: unknown }).baseUrl;
  const baseDir =
    typeof rawBaseUrl === 'string' && rawBaseUrl.length > 0
      ? nodePath.resolve(tsconfigDir, rawBaseUrl)
      : nodePath.resolve(tsconfigDir);
  return { baseDir, patterns };
}

/**
 * Matches a non-relative import specifier against the alias table and
 * returns the mapped absolute candidate directories (in target order), or
 * `undefined` when nothing matches. Relative specifiers (`./`, `../`) never
 * enter here — they resolve against the importer's own directory — and bare
 * package names match no pattern unless the tsconfig declares a catch-all
 * `*`, so third-party imports keep being skipped (ADR-0003).
 */
export function matchAlias(
  map: TsconfigAliasMap,
  specifier: string,
): readonly string[] | undefined {
  if (specifier.startsWith('./') || specifier.startsWith('../')) return undefined;
  for (const { pattern, targets } of map.patterns) {
    const star = pattern.indexOf('*');
    if (star === -1) {
      // Literal key: exact equality only, every target applies as written.
      if (pattern === specifier) return resolveTargets(map.baseDir, targets, '');
      continue;
    }
    // tsconfig allows a single `*` per pattern; a key with more would never
    // be written by hand — skip it rather than guess at semantics.
    if (pattern.indexOf('*', star + 1) !== -1) continue;
    const prefix = pattern.slice(0, star);
    const suffix = pattern.slice(star + 1);
    if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) continue;
    const middle = specifier.slice(prefix.length, specifier.length - suffix.length);
    return resolveTargets(map.baseDir, targets, middle);
  }
  return undefined;
}

/** Substitutes the matched `*` segment into each target and anchors it at the base directory. */
function resolveTargets(
  baseDir: string,
  targets: readonly string[],
  middle: string,
): readonly string[] {
  return targets.map((target) => {
    const expanded = target.includes('*') ? target.split('*').join(middle) : target;
    return nodePath.resolve(baseDir, expanded);
  });
}

/**
 * Specificity of a `paths` key: exact keys are fully literal (their whole
 * length counts); star keys compete on the literal prefix before the `*`.
 * Array#sort is stable, so ties keep tsconfig declaration order.
 */
function specificity(pattern: string): number {
  const star = pattern.indexOf('*');
  return star === -1 ? pattern.length : star;
}

/** Drops a leading UTF-8 BOM so BOM-prefixed tsconfigs still parse. */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Removes trailing commas before a `}` or `]`. A character scanner rather
 * than a regex: a regex like `,\s*([}\]])` cannot tell a trailing comma from
 * the same two characters *inside a string literal* (`"a, ]"`), and mangling
 * string content would corrupt configs that happen to contain such text.
 */
function stripTrailingCommas(text: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] as string;
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === ',') {
      let j = i + 1;
      while (j < text.length && isJsonWhitespace(text[j] as string)) j += 1;
      const next = text[j];
      if (next === '}' || next === ']') continue; // trailing comma: dropped
    }
    out += ch;
  }
  return out;
}

/** JSON whitespace, without pulling in a regex for a four-character check. */
function isJsonWhitespace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
