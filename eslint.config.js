import globals from 'globals';
import pluginJs from '@eslint/js';
import noEmojiPlugin from 'eslint-plugin-no-emoji';

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2021,
        chrome: 'readonly',
        // Vite environment
        'import.meta': 'readonly'
      }
    }
  },
  pluginJs.configs.recommended,
  {
    plugins: {
      'no-emoji': noEmojiPlugin
    },
    rules: {
      // Error prevention
      'no-unused-vars': ['warn', { 
        'argsIgnorePattern': '^_',
        'varsIgnorePattern': '^_',
        'caughtErrorsIgnorePattern': '^_'
      }],
      'no-console': 'off', // We use console for debugging
      'no-debugger': 'warn',
      
      // Code quality
      'eqeqeq': ['error', 'always'],
      'curly': ['error', 'multi-line'],
      'no-var': 'error',
      'prefer-const': 'warn',
      'prefer-arrow-callback': 'warn',
      'id-length': ['warn', { 
        'min': 2, 
        'exceptions': ['i', 'j', 'k', 'x', 'y', '_'],  // Allow common loop/coordinate vars
        'properties': 'never'  // Don't check object properties
      }],
      
      // Style (minimal - let Prettier handle formatting if needed)
      'semi': ['warn', 'always'],
      'quotes': ['warn', 'single', { 'avoidEscape': true }],
      'comma-dangle': ['warn', 'never'],
      
      // Chrome Extension specific
      'no-eval': 'error',
      'no-implied-eval': 'error',
      
      // No emoji in code
      'no-emoji/no-emoji': 'error'
    }
  },
  {
    // Test files
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        jest: 'readonly'
      }
    }
  },
  {
    // Node.js configuration files
    files: ['*.config.js', 'scripts/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },
  {
    // Ignore patterns
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      '*.min.js'
    ]
  }
];
