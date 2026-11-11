/**
 * Conservative, zero-dependency secret scanner (see ADR-0008).
 *
 * The goal is not Secretlint-grade coverage — it is to catch the most common
 * low-level accidents (a real `.env`, a pasted key, a private key block)
 * before a bundle leaves the machine. Rules are deliberately narrow: a miss
 * is acceptable, a false positive costs the user one click.
 *
 * Pure functions only: no IO, no vscode, no dependencies. Findings never
 * echo the matched text — only where (line) and which rule fired — so the
 * scanner's own output is safe to log and to show.
 */

/** One detection rule: a stable id, a human-readable label, and its pattern. */
export interface SecretRule {
  readonly id: string;
  readonly label: string;
  readonly pattern: RegExp;
  /**
   * Capture group whose content should be checked for obvious placeholder
   * values (`changeme`, `example`, …); omit for rules whose format alone is
   * specific enough (AWS/GitHub/Slack/Google) to need no value inspection.
   */
  readonly placeholderGroup?: number;
}

/** A hit: which rule fired and where. Never carries the matched content. */
export interface SecretFinding {
  readonly ruleId: string;
  readonly label: string;
  /** 1-based line number of the match. */
  readonly line: number;
}

/** Values that mark an assignment as an obvious placeholder, not a secret. */
const PLACEHOLDER_WORDS: readonly string[] = ['changeme', 'example', 'placeholder', 'xxxx'];

/** `aaaaaaaa…`-style values are placeholders, never secrets. */
const REPEATED_CHAR = /^(.)\1+$/;

function isPlaceholderValue(value: string): boolean {
  const lower = value.toLowerCase();
  return PLACEHOLDER_WORDS.some((word) => lower.includes(word)) || REPEATED_CHAR.test(value);
}

/**
 * The rule set. `github-token` appears twice — one entry per token shape —
 * sharing an id so both shapes dedupe to at most one finding per line.
 */
export const SECRET_RULES: readonly SecretRule[] = [
  {
    id: 'aws-access-key',
    label: 'AWS access key ID',
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
  },
  {
    id: 'private-key-block',
    label: 'Private key block',
    pattern: /-----BEGIN (RSA |EC |OPENSSH |PGP |DSA |ENCRYPTED )?PRIVATE KEY( BLOCK)?-----/,
  },
  {
    id: 'github-token',
    label: 'GitHub token',
    pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/,
  },
  {
    id: 'github-token',
    label: 'GitHub token',
    pattern: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/,
  },
  {
    id: 'slack-token',
    label: 'Slack token',
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  },
  {
    id: 'google-api-key',
    label: 'Google API key',
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/,
  },
  {
    // Format alone cannot prove a secret, so obvious test placeholders are
    // filtered out (ADR-0008): `sk-…` tokens whose payload reads like an
    // `xxxx…` dummy are skipped. Real `sk-ant-…` (Anthropic) keys still
    // match and are reported — a secret is a secret, whichever vendor
    // issued it. The payload (group 1) is what gets the placeholder check,
    // so a dummy like `sk-aaaa…` cannot hide behind the `sk-` prefix.
    id: 'openai-key',
    label: 'OpenAI-style API key',
    pattern: /\bsk-([A-Za-z0-9_-]{20,})\b/,
    placeholderGroup: 1,
  },
  {
    id: 'generic-credential-assignment',
    label: 'Credential-like assignment',
    // The keyword family is followed by a *bounded* name continuation. The
    // original `(?:_?[A-Za-z0-9]*)*` shape was an ambiguous nested quantifier
    // and could backtrack catastrophically (a 128-char run without `=`
    // froze the scan for minutes — review finding R1); a single bounded
    // quantifier is linear and matches the same name shapes.
    pattern:
      /(?:API_KEY|APIKEY|SECRET|TOKEN|PASSWORD|PASSWD|ACCESS_KEY)[A-Za-z0-9_]{0,48}\s*[=:]\s*["']?([A-Za-z0-9+/_-]{16,})["']?/,
    placeholderGroup: 1,
  },
];

/** 1-based line starts (offset of each line's first character) for O(log n) line lookup. */
function lineStarts(text: string): readonly number[] {
  const starts: number[] = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10 /* \n */) starts.push(i + 1);
  }
  return starts;
}

/** 1-based line number of the character at `index`, via the precomputed table. */
function lineAt(starts: readonly number[], index: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = lo + Math.ceil((hi - lo) / 2);
    const start = starts[mid];
    if (start === undefined || start <= index) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/**
 * Scans `text` for likely secrets and returns one finding per rule per line
 * (a rule that matches several times on the same line reports once; two
 * different rules on the same line each report). Findings are ordered by
 * line, then rule order, so `findings[0]` is the earliest suspicious line.
 */
export function scanText(text: string): SecretFinding[] {
  const seen = new Set<string>();
  const findings: { finding: SecretFinding; ruleIndex: number }[] = [];
  const starts = lineStarts(text);
  for (const [ruleIndex, rule] of SECRET_RULES.entries()) {
    // Rule patterns are declared without flags (stateless/shared); each scan
    // derives its own global copy so `lastIndex` can never leak between calls.
    const global = new RegExp(rule.pattern.source, 'g');
    for (const match of text.matchAll(global)) {
      if (rule.placeholderGroup !== undefined) {
        const group = match[rule.placeholderGroup];
        if (group === undefined || isPlaceholderValue(group)) continue;
      }
      const index = match.index ?? 0;
      const line = lineAt(starts, index);
      const key = `${rule.id}:${line}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({ finding: { ruleId: rule.id, label: rule.label, line }, ruleIndex });
    }
  }
  findings.sort((a, b) => a.finding.line - b.finding.line || a.ruleIndex - b.ruleIndex);
  return findings.map(({ finding }) => finding);
}
