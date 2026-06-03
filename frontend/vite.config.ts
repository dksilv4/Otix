/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  base: '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@ui': path.resolve(__dirname, 'src/features/dk-ui'),
      '@auth': path.resolve(__dirname, 'src/features/auth'),
      '@media': path.resolve(__dirname, 'src/features/media'),
      '@discover': path.resolve(__dirname, 'src/features/discover'),
      '@navigation': path.resolve(__dirname, 'src/features/navigation'),
      '@person': path.resolve(__dirname, 'src/features/person'),
      '@company': path.resolve(__dirname, 'src/features/company'),
      '@user': path.resolve(__dirname, 'src/features/user'),
      '@dk-ui': path.resolve(__dirname, 'src/features/dk-ui'),
      '@desktop': path.resolve(__dirname, '../desktop'),
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
