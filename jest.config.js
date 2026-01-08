/** @type {import('jest').Config} */
export default {
  testEnvironment: 'jsdom',
  moduleFileExtensions: ['js', 'mjs'],
  testMatch: ['**/tests/unit/**/*.test.js'],
  transform: {},
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    'site/**/*.js',
    '!src/**/*.test.js',
    '!site/**/*.test.js'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  verbose: true,
  testTimeout: 10000
};
