import type { ImportLanguageStrategy } from '../import-scanner';
import { CFamilyImportStrategy } from './c-family.strategy';
import { GoImportStrategy } from './go.strategy';
import { JavaImportStrategy } from './java.strategy';
import { PythonImportStrategy } from './python.strategy';
import { TypeScriptImportStrategy } from './typescript.strategy';

/** The strategies shipped with CodeSheaf, in dispatch-priority order. */
export const BUILT_IN_STRATEGIES: readonly ImportLanguageStrategy[] = [
  new TypeScriptImportStrategy(),
  new PythonImportStrategy(),
  new JavaImportStrategy(),
  new GoImportStrategy(),
  new CFamilyImportStrategy(),
];
