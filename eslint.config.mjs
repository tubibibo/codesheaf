// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['out/**', 'coverage/**', 'node_modules/**', '**/*.vsix', 'scripts/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
  {
    // Type-aware linting for every TypeScript file (tests included). One
    // project covers them all: tsconfig.test.json includes src, tests and
    // the vitest config (tsconfig.json exists for the emit build only).
    files: ['**/*.ts'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.test.json'],
      },
    },
  },
  {
    // Fire-and-forget promises live in the adapters, the composition root
    // and the entry point; type-aware linting is what can actually prove
    // every promise there is either awaited or explicitly voided.
    files: ['src/adapters/**/*.ts', 'src/composition/**/*.ts', 'src/extension.ts'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
  {
    // Hexagonal architecture guard: the core layer must never depend on the
    // platform (vscode) or on adapter implementations.
    files: ['src/core/**/*.ts', 'src/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['vscode', '**/adapters/**', '**/composition/**'],
              message:
                'core/application layers must stay platform-agnostic (hexagonal architecture): depend on ports, never on vscode or adapters.',
            },
          ],
        },
      ],
    },
  },
  {
    // Test-double idioms the type-checked preset cannot model: fakes that
    // resolve without awaiting, `expect(spy)` method access, and vitest's
    // `expect.any` (typed `any`). Everything else stays type-checked.
    files: ['tests/**/*.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
);
