/** @type {import('jest').Config} */
module.exports = {
  displayName: 'unit',
  rootDir: 'src',
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '^(?!.*\\.(integration|e2e)\\.spec\\.ts$).*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  setupFiles: ['<rootDir>/test/jest-setup-env.ts'],
  collectCoverageFrom: [
    '**/*.ts',
    '!**/generated/**',
    '!main.ts',
    '!**/*.module.ts',
    '!**/test/**',
    // Adapters DynamoDB e CLI: cobertos pelos e2e contra o DynamoDB Local.
    '!**/infrastructure/dynamodb-*.repository.ts',
    '!dynamodb/**',
    // Controllers/DTOs/presenters (borda HTTP): cobertos pelos e2e.
    '!**/infrastructure/*.controller.ts',
    '!**/infrastructure/dto/**',
    '!**/infrastructure/presenters/**',
    '!**/*.spec.ts',
  ],
  coverageDirectory: '../coverage/unit',
  // Gate da Fase 4 (>= 80% por servico).
  coverageThreshold: { global: { lines: 80, functions: 80, branches: 80, statements: 80 } },
};
