/**
 * A pragmatic subset of the `.gitignore` spec — sufficient for excluding
 * files while weaving bundles without pulling in a dependency.
 *
 * Supported: comments, blank lines, negation (`!`), directory-only patterns
 * (trailing `/`), root anchoring (leading or inner `/`), and the `**`, `*`,
 * `?` and `[...]` wildcards. Matching walks a path and each of its ancestor
 * directories with last-rule-wins semantics, mirroring how git prunes
 * excluded directories (see ADR-0005).
 */

interface CompiledRule {
  readonly negated: boolean;
  readonly dirOnly: boolean;
  readonly regex: RegExp;
  readonly source: string;
}

export class IgnoreMatcher {
  private constructor(private readonly rules: readonly CompiledRule[]) {}

  static fromPatterns(patterns: readonly string[]): IgnoreMatcher {
    const rules: CompiledRule[] = [];
    for (const raw of patterns) {
      const rule = compileRule(raw);
      if (rule !== undefined) rules.push(rule);
    }
    return new IgnoreMatcher(rules);
  }

  /**
   * Decides whether a workspace-relative POSIX path is ignored.
   *
   * Each ancestor-directory prefix and the full path are tested in order;
   * the last matching rule wins, so a negation in the merged pattern list
   * can re-include a path that an earlier pattern excluded.
   */
  isIgnored(relPosixPath: string): boolean {
    const segments = relPosixPath.split('/').filter((s) => s.length > 0);
    let ignored = false;
    for (let depth = 1; depth <= segments.length; depth += 1) {
      const partial = segments.slice(0, depth).join('/');
      const isDir = depth < segments.length;
      const decision = this.decide(partial, isDir);
      if (decision !== undefined) ignored = decision;
    }
    return ignored;
  }

  private decide(path: string, isDir: boolean): boolean | undefined {
    let result: boolean | undefined;
    for (const rule of this.rules) {
      if (rule.dirOnly && !isDir) continue;
      if (rule.regex.test(path)) result = !rule.negated;
    }
    return result;
  }
}

function compileRule(raw: string): CompiledRule | undefined {
  let line = raw.trim();
  if (line.length === 0 || line.startsWith('#')) return undefined;

  let negated = false;
  if (line.startsWith('!')) {
    negated = true;
    line = line.slice(1);
  }
  if (line.length === 0) return undefined;

  let dirOnly = false;
  if (line.endsWith('/')) {
    dirOnly = true;
    line = line.slice(0, -1);
  }
  if (line.length === 0) return undefined;

  // A slash anywhere (after the trailing one was removed) anchors to root.
  const anchored = line.includes('/');
  if (anchored && line.startsWith('/')) line = line.slice(1);
  if (line.length === 0) return undefined;

  const body = globToRegexSource(line);
  const source = anchored
    ? `^${body}(/.*)?$` // matches the path itself and everything beneath it
    : `^(?:.*/)?${body}(/.*)?$`; // unanchored: matches at any depth

  try {
    return { negated, dirOnly, regex: new RegExp(source), source: raw };
  } catch {
    return undefined; // invalid pattern: ignore it, never crash a bundle
  }
}

function globToRegexSource(glob: string): string {
  let out = '';
  let i = 0;
  const n = glob.length;
  while (i < n) {
    const ch = glob[i] as string;
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          out += '(?:.*/)?'; // `**/` — zero or more directories
          i += 3;
          continue;
        }
        out += '.*'; // bare `**`
        i += 2;
        continue;
      }
      out += '[^/]*';
      i += 1;
      continue;
    }
    if (ch === '?') {
      out += '[^/]';
      i += 1;
      continue;
    }
    if (ch === '[') {
      const end = glob.indexOf(']', i + 1);
      if (end !== -1) {
        let inner = glob.slice(i + 1, end);
        let negatedClass = '';
        if (inner.startsWith('!') || inner.startsWith('^')) {
          negatedClass = '^';
          inner = inner.slice(1);
        }
        out += `[${negatedClass}${inner.replace(/\\/g, '\\\\')}]`;
        i = end + 1;
        continue;
      }
    }
    out += escapeRegexChar(ch);
    i += 1;
  }
  return out;
}

function escapeRegexChar(ch: string): string {
  return /[.+^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
}
