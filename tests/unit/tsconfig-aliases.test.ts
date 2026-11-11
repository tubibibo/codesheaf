import * as nodePath from 'node:path';
import { describe, expect, it } from 'vitest';
import { matchAlias, parseTsconfigAliases } from '../../src/core/services/scan/tsconfig-aliases';
import { TypeScriptImportStrategy } from '../../src/core/services/scan/strategies/typescript.strategy';
import { PROJECT_ROOT } from '../support/fake-fs';

describe('parseTsconfigAliases', () => {
  it('parses a plain JSON tsconfig with baseUrl and paths', () => {
    const map = parseTsconfigAliases(
      '{"compilerOptions":{"baseUrl":"src","paths":{"@/*":["components/*"]}}}',
      PROJECT_ROOT,
    );
    expect(map).toBeDefined();
    expect(map?.baseDir).toBe(nodePath.resolve(PROJECT_ROOT, 'src'));
    expect(map?.patterns).toEqual([{ pattern: '@/*', targets: ['components/*'] }]);
  });

  it('defaults the base directory to the tsconfig directory when baseUrl is absent', () => {
    const map = parseTsconfigAliases(
      '{"compilerOptions":{"paths":{"~/*":["app/*"]}}}',
      PROJECT_ROOT,
    );
    expect(map?.baseDir).toBe(nodePath.resolve(PROJECT_ROOT));
  });

  it('parses C-style comments (JSONC)', () => {
    const map = parseTsconfigAliases(
      [
        '{',
        '  // line comment',
        '  "compilerOptions": {',
        '    /* block comment',
        '       spanning lines */',
        '    "paths": { "@/*": ["src/*"] }',
        '  }',
        '}',
      ].join('\n'),
      PROJECT_ROOT,
    );
    expect(map?.patterns).toEqual([{ pattern: '@/*', targets: ['src/*'] }]);
  });

  it('strips trailing commas without touching commas inside strings', () => {
    // A naive `,\s*[}\]]` regex would eat the `, ]` inside the string literal
    // and corrupt the document; the string-aware pass must not.
    const map = parseTsconfigAliases(
      '{"compilerOptions":{"paths":{"@/*":["src/*"],},},"note":"keep, ] exactly",}',
      PROJECT_ROOT,
    );
    expect(map?.patterns).toEqual([{ pattern: '@/*', targets: ['src/*'] }]);
  });

  it('returns undefined for JSON that is broken beyond trailing commas', () => {
    expect(parseTsconfigAliases('{"compilerOptions":', PROJECT_ROOT)).toBeUndefined();
    expect(parseTsconfigAliases('not json at all', PROJECT_ROOT)).toBeUndefined();
  });

  it('returns undefined when compilerOptions or paths are missing or mistyped', () => {
    expect(parseTsconfigAliases('{}', PROJECT_ROOT)).toBeUndefined();
    expect(parseTsconfigAliases('{"compilerOptions":{}}', PROJECT_ROOT)).toBeUndefined();
    expect(
      parseTsconfigAliases('{"compilerOptions":{"paths":"@/*"}}', PROJECT_ROOT),
    ).toBeUndefined();
    expect(
      parseTsconfigAliases('{"compilerOptions":{"paths":["@/*"]}}', PROJECT_ROOT),
    ).toBeUndefined();
  });

  it('keeps a present-but-empty paths object as a patternless map', () => {
    const map = parseTsconfigAliases('{"compilerOptions":{"paths":{}}}', PROJECT_ROOT);
    expect(map).toBeDefined();
    expect(map?.patterns).toEqual([]);
  });

  it('skips entries whose targets are not non-empty string arrays', () => {
    const map = parseTsconfigAliases(
      '{"compilerOptions":{"paths":{"@/*":["src/*", 5, null], "bad": "not-an-array", "empty": []}}}',
      PROJECT_ROOT,
    );
    expect(map?.patterns).toEqual([{ pattern: '@/*', targets: ['src/*'] }]);
  });
});

describe('matchAlias', () => {
  const map = parseTsconfigAliases(
    JSON.stringify({
      compilerOptions: {
        baseUrl: 'src',
        paths: {
          '@utils': ['utils/index.ts'],
          '@/*': ['*'],
          '@pkg/*/public': ['pkgs/*/src/public'],
          '~/*': ['first/*', 'second/*'],
        },
      },
    }),
    PROJECT_ROOT,
  )!;

  it('matches literal keys exactly and resolves every target', () => {
    expect(matchAlias(map, '@utils')).toEqual([
      nodePath.resolve(PROJECT_ROOT, 'src/utils/index.ts'),
    ]);
  });

  it('substitutes a leading-star pattern', () => {
    expect(matchAlias(map, '@/components/button')).toEqual([
      nodePath.resolve(PROJECT_ROOT, 'src/components/button'),
    ]);
  });

  it('substitutes a middle-star pattern', () => {
    expect(matchAlias(map, '@pkg/foo/public')).toEqual([
      nodePath.resolve(PROJECT_ROOT, 'src/pkgs/foo/src/public'),
    ]);
  });

  it('returns multiple targets in tsconfig order', () => {
    expect(matchAlias(map, '~/thing')).toEqual([
      nodePath.resolve(PROJECT_ROOT, 'src/first/thing'),
      nodePath.resolve(PROJECT_ROOT, 'src/second/thing'),
    ]);
  });

  it('does not match bare package names', () => {
    expect(matchAlias(map, 'react')).toBeUndefined();
    expect(matchAlias(map, '@scope/pkg')).toBeUndefined();
  });

  it('never matches relative specifiers', () => {
    expect(matchAlias(map, './sibling')).toBeUndefined();
    expect(matchAlias(map, '../parent')).toBeUndefined();
  });

  it('uses a star-less target of a star pattern as-is', () => {
    const fixed = parseTsconfigAliases(
      '{"compilerOptions":{"paths":{"@fixed/*":["vendor/fixed"]}}}',
      PROJECT_ROOT,
    )!;
    expect(matchAlias(fixed, '@fixed/anything')).toEqual([
      nodePath.resolve(PROJECT_ROOT, 'vendor/fixed'),
    ]);
  });

  it('requires the pattern suffix to match too', () => {
    expect(matchAlias(map, '@pkg/foo/private')).toBeUndefined();
  });
});

describe('TypeScriptImportStrategy alias context', () => {
  const strategy = new TypeScriptImportStrategy();
  const map = parseTsconfigAliases(
    '{"compilerOptions":{"baseUrl":"src","paths":{"@/*":["*"]}}}',
    PROJECT_ROOT,
  )!;

  it('maps an aliased specifier onto base-anchored candidates with extension probing', () => {
    const candidates = strategy.extractImports(
      'import { button } from "@/components/button";',
      `${PROJECT_ROOT}/app/main.ts`,
      { aliases: map },
    );
    const base = nodePath.resolve(PROJECT_ROOT, 'src/components/button');
    const paths = candidates.map((c) => c.path);
    // Resolution order: exact, then extensions, then index variants.
    expect(paths[0]).toBe(base);
    expect(paths.indexOf(`${base}.ts`)).toBeGreaterThan(paths.indexOf(base));
    expect(paths.indexOf(nodePath.join(base, 'index.ts'))).toBeGreaterThan(
      paths.indexOf(`${base}.cjs`),
    );
    expect(candidates.every((c) => c.kind === 'absolute')).toBe(true);
  });

  it('keeps skipping bare packages while still mapping matched aliases', () => {
    const bare = strategy.extractImports('import y from "react";', `${PROJECT_ROOT}/app/main.ts`, {
      aliases: map,
    });
    expect(bare).toEqual([]);
    const aliased = strategy.extractImports(
      'import x from "@/nowhere";',
      `${PROJECT_ROOT}/app/main.ts`,
      { aliases: map },
    );
    // The alias maps even when the target does not exist — existence is the
    // builder's probe, not the strategy's concern.
    expect(aliased.map((c) => c.path)[0]).toBe(nodePath.resolve(PROJECT_ROOT, 'src/nowhere'));
  });

  it('ignores aliases entirely when no context is given (previous behavior)', () => {
    const candidates = strategy.extractImports(
      'import { button } from "@/components/button";\nimport { b } from "./b";\n',
      `${PROJECT_ROOT}/app/main.ts`,
    );
    const paths = candidates.map((c) => c.path);
    expect(paths[0]).toBe(nodePath.resolve(`${PROJECT_ROOT}/app/b`));
    expect(paths.some((p) => p.includes('components'))).toBe(false);
  });
});
