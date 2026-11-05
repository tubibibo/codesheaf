import type { ImportLanguageStrategy, ResolvedCandidate } from '../import-scanner';
import { stripCStyleComments } from '../../../utils/text';

/**
 * Java strategy. `import com.example.app.Service;` maps to the
 * root-relative path `com/example/app/Service.java` (probed against each
 * workspace root). Static imports (`import static com.example.Util.MAX;`)
 * drop the member segment and map to the declaring class. Wildcard imports
 * (`com.example.*`) resolve to directories and are skipped. Comments are
 * stripped first, consistent with the other C-style strategies.
 */
export class JavaImportStrategy implements ImportLanguageStrategy {
  readonly id = 'java';
  readonly languageIds = ['java'];
  readonly extensions = ['.java'];

  extractImports(source: string): readonly ResolvedCandidate[] {
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
        out.push({ kind: 'root-relative', path: `${segments.join('/')}.java` });
      }
      match = importRe.exec(stripped);
    }
    return out;
  }
}
