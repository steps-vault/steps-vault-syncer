import javascript from '@eslint/js';
import typescript from 'typescript-eslint';

export default typescript.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/out/**', '**/coverage/**'] },
  javascript.configs.recommended,
  ...typescript.configs.strictTypeChecked,
  {
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      // Booleans read as questions: isSynced, hasMarker, shouldMove, wasEdited.
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'variable', types: ['boolean'], format: ['PascalCase', 'UPPER_CASE'], prefix: ['is', 'has', 'should', 'was', 'IS_', 'HAS_', 'SHOULD_', 'WAS_'] },
      ],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  { files: ['**/*.{js,mjs}'], ...typescript.configs.disableTypeChecked },
);
