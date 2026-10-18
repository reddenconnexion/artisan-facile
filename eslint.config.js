import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    plugins: { react },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // Les usages en JSX (<Icon />) comptent comme des références : un import
      // de composant inutilisé est signalé, et un composant non importé aussi.
      'react/jsx-uses-vars': 'error',
      'react/jsx-no-undef': 'error',
      'no-unused-vars': ['error', { varsIgnorePattern: '^(_|[A-Z][A-Z0-9_]*$)' }],
    },
  },
  {
    files: ['scripts/**/*.js', 'vite.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    // Éditeur de plan : script classique, ses fonctions globales sont appelées
    // depuis les attributs data-on* du HTML.
    files: ['public/plan-electrique.js'],
    languageOptions: { sourceType: 'script' },
    rules: {
      'no-unused-vars': ['error', { vars: 'local', varsIgnorePattern: '^(_|[A-Z][A-Z0-9_]*$)' }],
    },
  },
  {
    files: ['public/push-handler.js'],
    languageOptions: { globals: globals.serviceworker },
  },
])
