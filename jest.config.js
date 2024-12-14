module.exports = {
  testEnvironment: 'node',
  collectCoverage: true,
  coverageDirectory: 'coverage',
  testPathIgnorePatterns: ['/node_modules/', '/__tests__/'],
  transform: {
    '^.+\\.jsx?$': 'babel-jest'
  }
};