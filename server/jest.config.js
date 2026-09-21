module.exports = {
  testEnvironment: 'node',
  clearMocks: true,
  testPathIgnorePatterns: ['/node_modules/', '/tests/e2e/', '/tests/helpers/'],
  collectCoverageFrom: ['src/**/*.js'],
};
