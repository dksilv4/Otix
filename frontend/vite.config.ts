/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'
import path from 'node:path'

export default defineConfig({
  base: '/',
  plugins: [react(), svgr()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@ui': path.resolve(__dirname, 'src/components/ui'),
      '@auth': path.resolve(__dirname, 'src/features/auth'),
      '@activity': path.resolve(__dirname, 'src/features/activity'),
      '@media': path.resolve(__dirname, 'src/features/media'),
      '@calendar': path.resolve(__dirname, 'src/features/calendar'),
      '@discover': path.resolve(__dirname, 'src/features/discover'),
      '@launcher': path.resolve(__dirname, 'src/features/launcher'),
      '@navigation': path.resolve(__dirname, 'src/features/navigation'),
      '@search': path.resolve(__dirname, 'src/features/search'),
      '@settings': path.resolve(__dirname, 'src/features/settings'),
      '@person': path.resolve(__dirname, 'src/features/people'),
      '@library': path.resolve(__dirname, 'src/features/library'),
      '@list': path.resolve(__dirname, 'src/features/list'),
      '@people': path.resolve(__dirname, 'src/features/people'),
      '@company': path.resolve(__dirname, 'src/features/company'),
      '@user': path.resolve(__dirname, 'src/features/user'),
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
        bypass: (req) => {
          // Browser navigations send Accept: text/html — serve index.html so the SPA handles routing
          if (req.headers.accept?.includes('text/html')) {
            return '/index.html'
          }
        },
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
    exclude: ['node_modules/**', 'e2e/**', 'dist/**'],
  },
})
