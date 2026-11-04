/**
 * Comment strippers used before import scanning.
 *
 * They are deliberately simple, quote-aware scanners that replace comment
 * characters with spaces (preserving byte offsets and line structure) so the
 * regex-based language strategies never pick up imports from comments.
 * Template-literal `${...}` interpolation is treated as plain string content;
 * this is a documented heuristic limitation (see ADR-0003).
 */

/** Removes `//` and `/* ... *&#47;` comments while preserving strings and line structure. */
export function stripCStyleComments(source: string): string {
  const n = source.length;
  let out = '';
  let i = 0;
  let state: 'code' | 'line' | 'block' | 'dq' | 'sq' | 'bt' = 'code';
  while (i < n) {
    const ch = source[i] as string;
    const nx = i + 1 < n ? (source[i + 1] as string) : '';
    if (state === 'code') {
      if (ch === '/' && nx === '/') {
        out += '  ';
        state = 'line';
        i += 2;
        continue;
      }
      if (ch === '/' && nx === '*') {
        out += '  ';
        state = 'block';
        i += 2;
        continue;
      }
      if (ch === '"') state = 'dq';
      else if (ch === "'") state = 'sq';
      else if (ch === '`') state = 'bt';
      out += ch;
      i += 1;
      continue;
    }
    if (state === 'line') {
      out += ch === '\n' ? '\n' : ' ';
      if (ch === '\n') state = 'code';
      i += 1;
      continue;
    }
    if (state === 'block') {
      if (ch === '*' && nx === '/') {
        out += '  ';
        state = 'code';
        i += 2;
        continue;
      }
      out += ch === '\n' ? '\n' : ' ';
      i += 1;
      continue;
    }
    // String states: copy verbatim, honoring backslash escapes.
    out += ch;
    if (ch === '\\') {
      if (nx !== '') {
        out += nx;
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }
    const closing = state === 'dq' ? '"' : state === 'sq' ? "'" : '`';
    if (ch === closing) state = 'code';
    i += 1;
  }
  return out;
}

/** Removes `#` comments while preserving strings and line structure (Python-style). */
export function stripHashComments(source: string): string {
  const n = source.length;
  let out = '';
  let i = 0;
  let quote: string | null = null;
  while (i < n) {
    const ch = source[i] as string;
    if (quote !== null) {
      out += ch;
      if (ch === '\\') {
        const nx = i + 1 < n ? (source[i + 1] as string) : '';
        if (nx !== '') out += nx;
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '#') {
      while (i < n && source[i] !== '\n') {
        out += ' ';
        i += 1;
      }
      continue; // the trailing `\n` (or end of input) is handled by the loop
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** Escapes a string for safe use inside a double-quoted XML attribute. */
export function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Wraps arbitrary text in a CDATA section, defusing any `]]>` inside it. */
export function toCdata(text: string): string {
  const safe = text.split(']]>').join(']]]]><![CDATA[>');
  return `<![CDATA[${safe}]]>`;
}

/** Length of the longest run of backticks — used to pick a safe markdown fence. */
export function longestBacktickRun(text: string): number {
  let max = 0;
  let current = 0;
  for (const ch of text) {
    if (ch === '`') {
      current += 1;
      if (current > max) max = current;
    } else {
      current = 0;
    }
  }
  return max;
}

/** Prefixes every line with a zero-padded `N | ` marker (1-based). */
export function withLineNumbers(content: string): string {
  const lines = content.split('\n');
  const width = String(lines.length).length;
  return lines.map((line, idx) => `${String(idx + 1).padStart(width, ' ')} | ${line}`).join('\n');
}
