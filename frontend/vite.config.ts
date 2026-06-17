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
      '@auth': path.resolve(__dirname, 'src/features/auth'),
      '@ui': path.resolve(__dirname, 'src/old-features/dk-ui'),
      '@media': path.resolve(__dirname, 'src/features/media'),
      '@discover': path.resolve(__dirname, 'src/features/discover'),
      '@activity': path.resolve(__dirname, 'src/features/activity'),
      '@navigation': path.resolve(__dirname, 'src/features/navigation'),
      '@search': path.resolve(__dirname, 'src/features/search'),
      '@settings': path.resolve(__dirname, 'src/features/settings'),
      '@launcher': path.resolve(__dirname, 'src/features/launcher'),
      '@person': path.resolve(__dirname, 'src/old-features/person'),
      '@company': path.resolve(__dirname, 'src/old-features/company'),
      '@user': path.resolve(__dirname, 'src/old-features/user'),
      '@dk-ui': path.resolve(__dirname, 'src/old-features/dk-ui'),
      '@list': path.resolve(__dirname, 'src/old-features/list'),
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
  },
})
