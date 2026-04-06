module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.jest.test.js'],
  collectCoverageFrom: [
    'docs/app/shared.js',
    'docs/app/grader.js',
    'docs/app/criteria.js',
    'docs/app/render-standards.js',
    'docs/app/report-export.js'
  ]
};
