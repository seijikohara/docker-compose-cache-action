import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import securityPlugin from 'eslint-plugin-security';
import prettierPlugin from 'eslint-plugin-prettier';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import globals from 'globals';

export default [
  // 1. Global ignores
  { ignores: ['dist/**/*', 'node_modules/**/*'] },

  // 2. Base ESLint recommended rules
  js.configs.recommended,

  // 3. TypeScript specific configurations
  {
    files: ['**/*.ts'],
    languageOptions: {
      globals: { ...globals.node, ...globals.es2021, ...globals.jest },
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.eslint.json', // Reference the new tsconfig for ESLint
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      security: securityPlugin,
      prettier: prettierPlugin,
    },
    rules: {
      // Apply base + recommended rules first
      ...tseslint.configs.recommended.rules,
      ...securityPlugin.configs.recommended.rules,

      // Common overrides
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-expressions': ['error', { allowShortCircuit: false, allowTernary: false }],
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      'no-console': 'warn',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      'no-useless-escape': 'error',
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-object-injection': 'warn', // Keep as warn or adjust as needed

      // Add prettier rule back to run Prettier as an ESLint rule
      'prettier/prettier': 'error',
    },
  },

  // 4. Overrides specifically for test files
  {
    files: ['tests/**/*.ts'],
    rules: {
      // Disable rules problematic in tests
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      'security/detect-object-injection': 'off', // Also disable for tests
    },
  },

  // 5. Prettier config (ensure it's last to override conflicting ESLint formatting rules)
  eslintConfigPrettier,
];
