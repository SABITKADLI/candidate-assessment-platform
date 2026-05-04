module.exports = {
  root: true,
  extends: ['next/core-web-vitals'],
  settings: {
    next: {
      rootDir: ['apps/candidate/', 'apps/recruiter/'],
    },
  },
  ignorePatterns: [
    'node_modules/',
    '.next/',
    '**/.next/',
    '.turbo/',
    'dist/',
    'build/',
    'coverage/',
    'db/',
    'workers.env',
  ],
  rules: {
    '@next/next/no-html-link-for-pages': 'off',
    'react/no-unescaped-entities': 'off',
  },
};
