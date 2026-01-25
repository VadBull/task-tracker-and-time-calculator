import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'
import layerBoundaries from './eslint-plugin-boundaries/index.js'

const layers = ['app', 'pages', 'features', 'entities', 'shared']

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      boundaries: layerBoundaries,
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      'boundaries/layer-imports': [
        'error',
        {
          layers,
          aliases: {
            '@app': 'app',
            '@pages': 'pages',
            '@features': 'features',
            '@entities': 'entities',
            '@shared': 'shared',
          },
        },
      ],
    },
  },
])
