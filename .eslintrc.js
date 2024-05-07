module.exports = {
  extends: ['./node_modules/@api3/commons/dist/eslint/universal'],
  parserOptions: {
    project: ['./tsconfig.json'],
  },
  rules: {
    camelcase: 'off',

    'functional/no-try-statements': 'off',

    'lodash/prefer-constant': 'off',

    'unicorn/filename-case': 'off',
    'unicorn/prefer-export-from': 'off',
    'unicorn/prefer-object-from-entries': 'off',
    'unicorn/prefer-ternary': 'off',

    '@typescript-eslint/max-params': 'off',
    '@typescript-eslint/no-unsafe-call': 'off',
    '@typescript-eslint/no-unnecessary-type-assertion': 'off',
    '@typescript-eslint/require-await': 'off',
  },
};
