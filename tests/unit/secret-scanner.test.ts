import { describe, expect, it } from 'vitest';
import { scanText, SECRET_RULES } from '../../src/core/services/secret-scanner';

/** A hit must be exactly {ruleId, label, line} — no matched content may leak. */
function expectSingle(text: string, ruleId: string, label: string, line: number): void {
  const findings = scanText(text);
  expect(findings).toHaveLength(1);
  expect(findings[0]).toEqual({ ruleId, label, line });
}

describe('scanText rules', () => {
  it('flags an AWS access key ID and ignores shorter or non-uppercase lookalikes', () => {
    expectSingle('key = "AKIAABCDEFGHIJKLMNOP";', 'aws-access-key', 'AWS access key ID', 1);
    expect(scanText('key = "AKIA123";')).toHaveLength(0);
    expect(scanText('key = "AKIAABCDEFGHIJKLMNOPQ";')).toHaveLength(0); // 17 chars
    expect(scanText('key = "akiaabcdefghijklmnop";')).toHaveLength(0);
  });

  it('flags private key blocks in every flavor and ignores other PEM blocks', () => {
    expectSingle('-----BEGIN PRIVATE KEY-----', 'private-key-block', 'Private key block', 1);
    expectSingle('-----BEGIN RSA PRIVATE KEY-----', 'private-key-block', 'Private key block', 1);
    expectSingle(
      '-----BEGIN OPENSSH PRIVATE KEY-----',
      'private-key-block',
      'Private key block',
      1,
    );
    expectSingle(
      '-----BEGIN PGP PRIVATE KEY BLOCK-----',
      'private-key-block',
      'Private key block',
      1,
    );
    expect(scanText('-----BEGIN CERTIFICATE-----')).toHaveLength(0);
    expect(scanText('-----BEGIN PUBLIC KEY-----')).toHaveLength(0);
  });

  it('flags classic and fine-grained GitHub tokens and ignores short fragments', () => {
    const classic = 'token: ghp_123456789012345678901234567890123456';
    expectSingle(classic, 'github-token', 'GitHub token', 1);
    const fineGrained = 'token: github_pat_1234567890123456789012';
    expectSingle(fineGrained, 'github-token', 'GitHub token', 1);
    expect(scanText('token: ghp_123')).toHaveLength(0);
    expect(scanText('token: ghs_123')).toHaveLength(0); // invalid prefix letter
    expect(scanText('token: github_pat_short')).toHaveLength(0);
  });

  it('flags Slack tokens and ignores short fragments', () => {
    expectSingle('x = xoxb-1234567890', 'slack-token', 'Slack token', 1);
    expect(scanText('x = xoxb-12345')).toHaveLength(0);
  });

  it('flags Google API keys and ignores wrong lengths', () => {
    expectSingle('AIza' + 'a'.repeat(35), 'google-api-key', 'Google API key', 1);
    expect(scanText('AIza' + 'a'.repeat(34))).toHaveLength(0);
    expect(scanText('AIza' + 'a'.repeat(36))).toHaveLength(0);
  });

  it('flags sk- style API keys but filters obvious placeholders', () => {
    expectSingle(
      'Authorization: Bearer sk-proj-abcdefghij1234567890',
      'openai-key',
      'OpenAI-style API key',
      1,
    );
    // Anthropic keys also match the sk- shape and are reported (ADR-0008):
    // a secret is a secret, whichever vendor issued it.
    expectSingle('sk-ant-api03-abcdefghijklmnopqrstu', 'openai-key', 'OpenAI-style API key', 1);
    expect(scanText('sk-short')).toHaveLength(0);
    expect(scanText('sk-xxxxxxxxxxxxxxxxxxxx')).toHaveLength(0); // xxxx placeholder
    expect(scanText('sk-aaaaaaaaaaaaaaaaaaaa')).toHaveLength(0); // repeated char
    // a long sk- token that merely contains 'x' but no placeholder word stays flagged
    expect(scanText('sk-abcdefghij12345x6789')).toHaveLength(1);
  });

  it('flags credential-shaped assignments but filters placeholder values and short values', () => {
    expectSingle(
      'API_KEY=abcdefghijklmnop',
      'generic-credential-assignment',
      'Credential-like assignment',
      1,
    );
    expectSingle(
      'DATABASE_PASSWORD: "supersecretvalue123"',
      'generic-credential-assignment',
      'Credential-like assignment',
      1,
    );
    expectSingle(
      'MY_SECRET_TOKEN=0123456789abcdef',
      'generic-credential-assignment',
      'Credential-like assignment',
      1,
    );
    // keyword suffixes are part of the name (SECRET_NOTE, ACCESS_KEY_ID, ...)
    expectSingle(
      'ACCESS_KEY_ID=0123456789abcdef',
      'generic-credential-assignment',
      'Credential-like assignment',
      1,
    );
    // obvious placeholders never report
    expect(scanText('API_KEY=changeme_123456789')).toHaveLength(0);
    expect(scanText('API_KEY=thisisjustanexample')).toHaveLength(0);
    expect(scanText('API_KEY=placeholder_value_ok')).toHaveLength(0);
    expect(scanText('API_KEY=xxxxxxxxxxxxxxxx')).toHaveLength(0);
    expect(scanText('API_KEY=aaaaaaaaaaaaaaaa')).toHaveLength(0);
    expect(scanText("PASSWORD = 'changeme_but_longer_value'")).toHaveLength(0);
    // too-short or missing values never report
    expect(scanText('API_KEY=short')).toHaveLength(0);
    expect(scanText('API_KEY=')).toHaveLength(0);
    // lowercase keywords stay unflagged (deliberately conservative)
    expect(scanText('api_key=abcdefghijklmnop')).toHaveLength(0);
  });
});

describe('scanText reporting', () => {
  it('reports 1-based line numbers across a multi-line file, ordered by line', () => {
    const text = [
      'const name = "innocent";',
      'const key = "AKIAABCDEFGHIJKLMNOP";',
      'const other = 42;',
      'const id = "AKIAQRSTUVWXYZ123456";',
    ].join('\n');
    const findings = scanText(text);
    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({ ruleId: 'aws-access-key', line: 2 });
    expect(findings[1]).toMatchObject({ ruleId: 'aws-access-key', line: 4 });
  });

  it('reports each rule once per line but distinct rules on the same line separately', () => {
    const line = 'AKIAABCDEFGHIJKLMNOP and ghp_123456789012345678901234567890123456';
    const findings = scanText(line);
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.ruleId)).toEqual(['aws-access-key', 'github-token']);
    // the same rule twice on one line dedupes
    const twice = 'AKIAABCDEFGHIJKLMNOP AKIAQRSTUVWXYZ123456';
    expect(scanText(twice)).toHaveLength(1);
  });

  it('never echoes the matched content', () => {
    const secret = 'ghp_123456789012345678901234567890123456';
    const findings = scanText(`const t = "${secret}";`);
    expect(findings).toHaveLength(1);
    expect(Object.keys(findings[0] ?? {}).sort()).toEqual(['label', 'line', 'ruleId']);
    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  it('finds nothing in innocent text', () => {
    expect(scanText('export const a = 1;\nimport { b } from "./b";\n')).toHaveLength(0);
    expect(scanText('')).toHaveLength(0);
  });

  it('declares exactly the documented rule ids', () => {
    expect([...new Set(SECRET_RULES.map((r) => r.id))]).toEqual([
      'aws-access-key',
      'private-key-block',
      'github-token',
      'slack-token',
      'google-api-key',
      'openai-key',
      'generic-credential-assignment',
    ]);
  });
});
