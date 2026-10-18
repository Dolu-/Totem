import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'legacy/',
      'dist/',
      'dist-e2e/',
      'dev-dist/',
      'coverage/',
      'test-results/',
      'playwright-report/',
      'node_modules/',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.js'] },
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser },
    },
    rules: {
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/consistent-type-imports': 'error',
      // `const { ignoree, ...reste } = objet` : écarter une propriété est voulu.
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
    },
  },
  {
    // Le moteur doit rester pur : ni DOM, ni temps réel, ni hasard global.
    files: ['src/core/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'navigator',
        'localStorage',
        'performance',
        'requestAnimationFrame',
        'setTimeout',
        'setInterval',
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Utiliser la RNG à graine (core/rng.ts).' },
        { object: 'Date', property: 'now', message: 'Le temps est fourni par update(dtMs).' },
      ],
    },
  },
  {
    files: ['tests/**/*.ts', 'e2e/**/*.ts', 'scripts/**/*.ts', '*.config.ts', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['eslint.config.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  prettier,
);
