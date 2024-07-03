module.exports = {
  extends: ['plugin:@api3/eslint-plugin-commons/universal'],
  parserOptions: {
    project: ['./tsconfig.json'],
  },
  rules: {
    camelcase: 'off',
    'no-nested-ternary': 'off',

    'functional/no-try-statements': 'off',

    'lodash/prefer-constant': 'off',

    'unicorn/filename-case': 'off',
    'unicorn/no-anonymous-default-export': 'off',
    'unicorn/prefer-export-from': 'off',
    'unicorn/prefer-object-from-entries': 'off',
    'unicorn/prefer-ternary': 'off',

    '@typescript-eslint/max-params': 'off',
    '@typescript-eslint/no-unnecessary-type-assertion': 'off',
    '@typescript-eslint/no-unsafe-call': 'off',
    '@typescript-eslint/require-await': 'off',
  },
};
