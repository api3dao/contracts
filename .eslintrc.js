module.exports = {
  env: {
    es6: true,
    mocha: true,
    node: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 11,
    sourceType: 'module',
  },
  extends: 'eslint:recommended',
  plugins: ['@typescript-eslint'],
};
