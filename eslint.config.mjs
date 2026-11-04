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
      '@typescript-eslint/explicit-function-return-type': 'off',
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
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
    files: ['tests/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
);
