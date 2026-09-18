module.exports = {
  root: true,
  env: { node: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: ['dist/', 'node_modules/', '.wrangler/', '**/worker-configuration.d.ts'],
  rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }] },
  overrides: [{
    files: ['**/*.vue'], env: { browser: true }, parser: 'vue-eslint-parser',
    parserOptions: { parser: '@typescript-eslint/parser', ecmaVersion: 2022, sourceType: 'module' },
    extends: ['plugin:vue/vue3-essential'],
    rules: { 'vue/multi-word-component-names': 'off' }
  }]
};
