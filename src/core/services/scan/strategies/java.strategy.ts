import type { ImportLanguageStrategy, ResolvedCandidate } from '../import-scanner';
import { stripCStyleComments } from '../../../utils/text';

/**
 * Java strategy. `import com.example.app.Service;` maps to the
 * root-relative path `com/example/app/Service.java` (probed against each
 * workspace root). Inner-class imports (`com.x.Outer.Inner`) map to the
 * *declaring* source file — the leftmost capitalized segment — since Java
 * types share one file. Static imports (`import static com.example.Util.MAX;`)
 * drop the member segment first, then apply the same rule. Wildcard imports
 * (`com.example.*`) resolve to directories and are skipped. Comments are
 * stripped first, consistent with the other C-style strategies.
 */
export class JavaImportStrategy implements ImportLanguageStrategy {
  readonly id = 'java';
  readonly languageIds = ['java'];
  readonly extensions = ['.java'];

  extractImports(source: string, _importerAbsolutePath: string): readonly ResolvedCandidate[] {
    const stripped = stripCStyleComments(source);
    const importRe = /^[ \t]*import[ \t]+(static[ \t]+)?([\w.]+(?:\.\*)?)[ \t]*;/gm;
    const out: ResolvedCandidate[] = [];
    let match: RegExpExecArray | null = importRe.exec(stripped);
    while (match !== null) {
      const isStatic = match[1] !== undefined;
      const specifier = match[2];
      if (specifier !== undefined && !specifier.endsWith('.*')) {
        const segments = specifier.split('.');
        if (isStatic && segments.length > 1) segments.pop(); // drop the member name
        out.push({ kind: 'root-relative', path: `${declaringTypePath(segments)}.java` });
      }
      match = importRe.exec(stripped);
    }
    return out;
  }
}

/**
 * Java convention: packages are lowercase, types capitalized. Everything up
 * to and including the first capitalized segment names the declaring type;
 * further segments are nested classes living in the same file.
 */
function declaringTypePath(segments: readonly string[]): string {
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    const firstChar = segment !== undefined && segment.length > 0 ? segment[0] : undefined;
    if (firstChar !== undefined && firstChar >= 'A' && firstChar <= 'Z') {
      return segments.slice(0, i + 1).join('/');
    }
  }
  return segments.join('/');
}
