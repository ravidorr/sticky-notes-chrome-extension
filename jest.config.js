/** @type {import('jest').Config} */
export default {
  testEnvironment: 'jsdom',
  moduleFileExtensions: ['js', 'mjs'],
  testMatch: ['**/tests/unit/**/*.test.js'],
  // Claude Code keeps session worktrees under .claude/worktrees; they are copies of this repo
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/.claude/'],
  transform: {},
  moduleNameMapper: {
    '^firebase-admin/firestore$': '<rootDir>/tests/mocks/firebaseAdminFirestore.js',
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    'site/**/*.js',
    'functions/lib/email.js',
    'functions/lib/mailSender.js',
    'functions/lib/mailTrigger.js',
    'functions/lib/noteSharing.js',
    '!src/**/*.test.js',
    '!site/**/*.test.js',
    '!src/background/index.js',
    '!src/content/index.js',
    '!src/content/app/StickyNotesApp.js',
    '!site/**/*.min.js'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      statements: 85,
      branches: 75,
      functions: 75,
      lines: 85
    }
  },
  verbose: true,
  testTimeout: 10000
};
