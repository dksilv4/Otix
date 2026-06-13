/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  base: '/',
  plugins: [react()],
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@auth': path.resolve(__dirname, 'src/features/auth'),
      '@ui': path.resolve(__dirname, 'src/old-features/dk-ui'),
      '@media': path.resolve(__dirname, 'src/old-features/media'),
      '@discover': path.resolve(__dirname, 'src/old-features/discover'),
      '@navigation': path.resolve(__dirname, 'src/old-features/navigation'),
      '@person': path.resolve(__dirname, 'src/old-features/person'),
      '@company': path.resolve(__dirname, 'src/old-features/company'),
      '@user': path.resolve(__dirname, 'src/old-features/user'),
      '@dk-ui': path.resolve(__dirname, 'src/old-features/dk-ui'),
      '@desktop': path.resolve(__dirname, '../desktop'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/media': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/three')) return 'three'
          if (id.includes('node_modules/framer-motion')) return 'framer-motion'
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'react'
        },
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
