import globals from 'globals';

export default [{
  files: ['bin/*.ts', 'lib/*.ts'],
  languageOptions: {
    globals: {
      ...globals.node,
    },
  },
  rules: {
    'no-new': 'off',
  },
}, {
  files: ['passwordless/vite.config.ts'],
  languageOptions: {
    globals: {
      ...globals.node,
    },
    parserOptions: {
      project: 'passwordless/tsconfig.node.json',
    },
  },
}, {
  files: ['passwordless/src/*.ts'],
  languageOptions: {
    globals: {
      ...globals.browser,
    },
  },
}];
