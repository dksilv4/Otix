import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts'],
    // Avoid running test files through the main build
    exclude: ['node_modules', 'dist'],
  },
})
