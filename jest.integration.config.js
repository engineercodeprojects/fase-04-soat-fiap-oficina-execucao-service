/** @type {import('jest').Config} */
module.exports = {
  displayName: 'integration',
  rootDir: 'src',
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.*\\.(integration|e2e)\\.spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  setupFiles: ['<rootDir>/test/jest-setup-env.ts'],
  collectCoverageFrom: [
    '**/infrastructure/dynamodb-*.repository.ts',
    '**/infrastructure/*.controller.ts',
    'dynamodb/**/*.ts',
    '!dynamodb/create-tables.cli.ts',
  ],
  coverageDirectory: '../coverage/integration',
  testTimeout: 60000,
  // DynamoDB Local (testcontainers ou DYNAMODB_ENDPOINT) — serializado e estavel.
  maxWorkers: 1,
};
