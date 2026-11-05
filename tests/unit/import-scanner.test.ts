import { describe, expect, it } from 'vitest';
import type { ResolvedCandidate } from '../../src/core/services/scan/import-scanner';
import { ImportScannerService } from '../../src/core/services/scan/import-scanner';
import { BUILT_IN_STRATEGIES } from '../../src/core/services/scan/strategies';
import { TypeScriptImportStrategy } from '../../src/core/services/scan/strategies/typescript.strategy';
import { PythonImportStrategy } from '../../src/core/services/scan/strategies/python.strategy';
import { JavaImportStrategy } from '../../src/core/services/scan/strategies/java.strategy';
import { GoImportStrategy } from '../../src/core/services/scan/strategies/go.strategy';
import { CFamilyImportStrategy } from '../../src/core/services/scan/strategies/c-family.strategy';
import { PROJECT_ROOT } from '../support/fake-fs';

const norm = (candidates: readonly ResolvedCandidate[]): string[] =>
  candidates.map((c) => `${c.kind}:${c.path.replace(/\\/g, '/')}`);

describe('TypeScriptImportStrategy', () => {
  const strategy = new TypeScriptImportStrategy();

  it('finds named, multiline, type-only, side-effect, re-export, require and dynamic imports', () => {
    const source = [
      'import { b } from "./b";',
      'import {',
      '  longName,',
      "} from './multi';",
      'import type { T } from "../types/t";',
      'import "./side-effect";',
      'export { helper } from "./reexport";',
      'const lib = require("./legacy");',
      'const lazy = import("./lazy");',
    ].join('\n');
    const paths = norm(strategy.extractImports(source, `${PROJECT_ROOT}/src/a.ts`));
    expect(paths).toContain(`absolute:${PROJECT_ROOT}/src/b.ts`);
    expect(paths).toContain(`absolute:${PROJECT_ROOT}/src/multi.ts`);
    expect(paths).toContain(`absolute:${PROJECT_ROOT}/types/t.ts`);
    expect(paths).toContain(`absolute:${PROJECT_ROOT}/src/side-effect.ts`);
    expect(paths).toContain(`absolute:${PROJECT_ROOT}/src/reexport.ts`);
    expect(paths).toContain(`absolute:${PROJECT_ROOT}/src/legacy.js`);
    expect(paths).toContain(`absolute:${PROJECT_ROOT}/src/lazy.ts`);
  });

  it('probes extension and index variants in resolution order', () => {
    const paths = norm(
      strategy.extractImports('import x from "./widget"', `${PROJECT_ROOT}/src/a.ts`),
    );
    expect(paths.indexOf(`absolute:${PROJECT_ROOT}/src/widget`)).toBeLessThan(
      paths.indexOf(`absolute:${PROJECT_ROOT}/src/widget.ts`),
    );
    expect(paths.indexOf(`absolute:${PROJECT_ROOT}/src/widget.ts`)).toBeLessThan(
      paths.indexOf(`absolute:${PROJECT_ROOT}/src/widget/index.ts`),
    );
  });

  it('skips bare package specifiers and URLs', () => {
    const source = `import React from "react";
import { x } from "https://example.com/x";
const fs = require("node:fs");`;
    expect(strategy.extractImports(source, `${PROJECT_ROOT}/src/a.ts`)).toHaveLength(0);
  });

  it('never scans inside comments', () => {
    const source = '// import { ghost } from "./ghost";\n/* import { ghost2 } from "./ghost2"; */';
    expect(strategy.extractImports(source, `${PROJECT_ROOT}/src/a.ts`)).toHaveLength(0);
  });
});

describe('PythonImportStrategy', () => {
  const strategy = new PythonImportStrategy();

  it('resolves explicit relative imports against the importing file', () => {
    const source = 'from .util import helper\nfrom ..pkg.mod import thing\n';
    const paths = norm(strategy.extractImports(source, `${PROJECT_ROOT}/pkg/main.py`));
    expect(paths).toContain(`absolute:${PROJECT_ROOT}/pkg/util.py`);
    expect(paths).toContain(`absolute:${PROJECT_ROOT}/pkg/util/__init__.py`);
    expect(paths).toContain(`absolute:${PROJECT_ROOT}/pkg/mod.py`); // ..pkg.mod
    expect(paths).toContain(`absolute:${PROJECT_ROOT}/pkg/mod/__init__.py`);
  });

  it('turns absolute module imports into root-relative candidates', () => {
    const source = 'import os\nimport mypkg.tools, other\nfrom mypkg import deep\n';
    const paths = norm(strategy.extractImports(source, `${PROJECT_ROOT}/main.py`));
    expect(paths).toContain('root-relative:os.py');
    expect(paths).toContain('root-relative:mypkg/tools.py');
    expect(paths).toContain('root-relative:other.py');
    expect(paths).toContain('root-relative:mypkg.py');
    expect(paths).toContain('root-relative:mypkg/deep.py'); // imported name = submodule
  });

  it('skips __future__', () => {
    expect(
      strategy.extractImports('from __future__ import annotations\n', `${PROJECT_ROOT}/a.py`),
    ).toHaveLength(0);
  });

  it('produces the package __init__ and sibling modules for "from . import x"', () => {
    const paths = norm(
      strategy.extractImports('from . import helper, sub\n', `${PROJECT_ROOT}/pkg/a.py`),
    );
    expect(paths).toContain(`absolute:${PROJECT_ROOT}/pkg/__init__.py`);
    expect(paths).toContain(`absolute:${PROJECT_ROOT}/pkg/helper.py`);
    expect(paths).toContain(`absolute:${PROJECT_ROOT}/pkg/helper/__init__.py`);
    expect(paths).toContain(`absolute:${PROJECT_ROOT}/pkg/sub.py`);
    expect(paths.some((p) => p === `absolute:${PROJECT_ROOT}/pkg.py`)).toBe(false);
  });

  it('resolves imported names of a dotted module as its submodules', () => {
    const paths = norm(
      strategy.extractImports('from mypkg import deep, other\n', `${PROJECT_ROOT}/main.py`),
    );
    expect(paths).toContain('root-relative:mypkg/deep.py');
    expect(paths).toContain('root-relative:mypkg/deep/__init__.py');
    expect(paths).toContain('root-relative:mypkg/other.py');
  });

  it('parses parenthesized multi-line from-import name lists', () => {
    const source = 'from . import (\n  helper,\n  tools as t,\n)\n';
    const paths = norm(strategy.extractImports(source, `${PROJECT_ROOT}/pkg/a.py`));
    expect(paths).toContain(`absolute:${PROJECT_ROOT}/pkg/helper.py`);
    expect(paths).toContain(`absolute:${PROJECT_ROOT}/pkg/tools.py`);
  });

  it('drops as-aliases and star imports from name lists', () => {
    const paths = norm(
      strategy.extractImports('from . import x as y, *\n', `${PROJECT_ROOT}/a.py`),
    );
    expect(paths).toContain(`absolute:${PROJECT_ROOT}/x.py`);
    expect(paths.some((p) => p.endsWith('/y.py'))).toBe(false);
    expect(paths).toHaveLength(3); // x.py + x/__init__.py + the package's own __init__.py
  });
});

describe('JavaImportStrategy', () => {
  const strategy = new JavaImportStrategy();

  it('maps package imports to root-relative java paths', () => {
    const source =
      'package com.x;\n\nimport com.example.app.Service;\nimport static com.example.Util.MAX;\n';
    const paths = norm(strategy.extractImports(source, `${PROJECT_ROOT}/src/Main.java`));
    expect(paths).toContain('root-relative:com/example/app/Service.java');
    expect(paths).toContain('root-relative:com/example/Util.java');
  });

  it('skips wildcard imports', () => {
    const source = 'import com.example.*;\n';
    expect(strategy.extractImports(source, `${PROJECT_ROOT}/src/Main.java`)).toHaveLength(0);
  });

  it('maps inner-class imports to the declaring source file', () => {
    // com.x.Outer.Inner lives in Outer.java, not Outer/Inner.java.
    const source = 'import com.x.Outer.Inner;\n';
    const paths = norm(strategy.extractImports(source, `${PROJECT_ROOT}/src/Main.java`));
    expect(paths).toContain('root-relative:com/x/Outer.java');
    expect(paths.some((p) => p.includes('Inner'))).toBe(false);
  });

  it('never scans inside comments', () => {
    const source =
      '// import com.ghost.Ghost;\n/* import com.ghost2.Ghost2; */\nimport com.real.Real;\n';
    const paths = norm(strategy.extractImports(source, `${PROJECT_ROOT}/src/Main.java`));
    expect(paths).toContain('root-relative:com/real/Real.java');
    expect(paths.some((p) => p.includes('ghost'))).toBe(false);
  });
});

describe('GoImportStrategy', () => {
  const strategy = new GoImportStrategy();

  it('reads block and single imports', () => {
    const source =
      'package main\n\nimport (\n\t"fmt"\n\tappUtil "myapp/internal/util"\n)\n\nimport extra "myapp/extra"\n';
    const paths = norm(strategy.extractImports(source, `${PROJECT_ROOT}/cmd/main.go`));
    expect(paths).toContain('root-relative:fmt.go');
    expect(paths).toContain('root-relative:myapp/internal/util.go');
    expect(paths).toContain('root-relative:myapp/extra.go');
  });

  it('resolves relative specifiers against the importing file', () => {
    const paths = norm(strategy.extractImports('import "./util"\n', `${PROJECT_ROOT}/cmd/main.go`));
    expect(paths).toContain(`absolute:${PROJECT_ROOT}/cmd/util.go`);
  });
});

describe('CFamilyImportStrategy', () => {
  const strategy = new CFamilyImportStrategy();

  it('resolves quoted includes and skips system includes', () => {
    const source = '#include <stdio.h>\n#include "sub/util.h"\n';
    const paths = norm(strategy.extractImports(source, `${PROJECT_ROOT}/src/main.c`));
    expect(paths).toContain(`absolute:${PROJECT_ROOT}/src/sub/util.h`);
    expect(paths.some((p) => p.includes('stdio'))).toBe(false);
  });
});

describe('ImportScannerService', () => {
  const service = new ImportScannerService(BUILT_IN_STRATEGIES);

  it('dispatches by language id first, then by extension', () => {
    expect(service.strategyFor('python', 'x.txt')?.id).toBe('python');
    expect(service.strategyFor('plaintext', 'x.go')?.id).toBe('go');
    expect(service.strategyFor('plaintext', 'x.unknown')).toBeUndefined();
  });

  it('returns no candidates for unknown languages', () => {
    const candidates = service.collectCandidates({
      languageId: 'plaintext',
      absolutePath: `${PROJECT_ROOT}/file.unknown`,
      content: 'import "./x";',
    });
    expect(candidates).toHaveLength(0);
  });
});
