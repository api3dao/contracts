/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/configuration
 */
module.exports = {
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageProvider: 'v8',
  modulePathIgnorePatterns: ['<rootDir>/.build', '<rootDir>/dist/', '<rootDir>/build/'],
  preset: 'ts-jest',
  restoreMocks: true,
  testEnvironment: 'jest-environment-node',
};
