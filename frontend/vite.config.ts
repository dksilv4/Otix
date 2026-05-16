/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@ui': path.resolve(__dirname, 'src/features/ui'),
      '@auth': path.resolve(__dirname, 'src/features/auth'),
      '@media': path.resolve(__dirname, 'src/features/media'),
      '@discover': path.resolve(__dirname, 'src/features/discover'),
      '@navigation': path.resolve(__dirname, 'src/features/navigation'),
      '@person': path.resolve(__dirname, 'src/features/person'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
    css: true,
  },
})
