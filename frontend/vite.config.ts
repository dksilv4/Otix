/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'
import path from 'node:path'

export default defineConfig({
  base: '/',
  plugins: [
    react({
      include: /\.(jsx|tsx)$/,
    }),
    svgr(),
  ],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@ui': path.resolve(import.meta.dirname, 'src/components/ui'),
      '@auth': path.resolve(import.meta.dirname, 'src/features/auth'),
      '@activity': path.resolve(import.meta.dirname, 'src/features/activity'),
      '@media': path.resolve(import.meta.dirname, 'src/features/media'),
      '@calendar': path.resolve(import.meta.dirname, 'src/features/calendar'),
      '@discover': path.resolve(import.meta.dirname, 'src/features/discover'),
      '@launcher': path.resolve(import.meta.dirname, 'src/features/launcher'),
      '@navigation': path.resolve(import.meta.dirname, 'src/features/navigation'),
      '@search': path.resolve(import.meta.dirname, 'src/features/search'),
      '@settings': path.resolve(import.meta.dirname, 'src/features/settings'),
      '@person': path.resolve(import.meta.dirname, 'src/features/people'),
      '@library': path.resolve(import.meta.dirname, 'src/features/library'),
      '@list': path.resolve(import.meta.dirname, 'src/features/list'),
      '@people': path.resolve(import.meta.dirname, 'src/features/people'),
      '@company': path.resolve(import.meta.dirname, 'src/features/company'),
      '@user': path.resolve(import.meta.dirname, 'src/features/user'),
      '@genre': path.resolve(import.meta.dirname, 'src/features/genre'),
      '@desktop': path.resolve(import.meta.dirname, '../desktop'),
    },
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      '@tanstack/react-query',
      '@tanstack/react-router',
      'axios',
      'lucide-react',
      'clsx',
      'tailwind-merge',
    ],
  },
  server: {
    host: process.env.VITE_HOST || '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    watch: {
      usePolling: process.env.VITE_USE_POLLING === 'true',
      interval: 1000,
      ignored: [
        '**/node_modules/**',
        '**/dist/**',
        '**/.git/**',
        '**/.idea/**',
        '**/.pytest_cache/**',
        '**/.ruff_cache/**',
        '**/.tmp/**',
        '**/.vite/**',
        '**/*.log',
        '**/.DS_Store',
      ],
    },
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:8000',
        changeOrigin: true,
        xfwd: true,
        timeout: 0,
        proxyTimeout: 0,
        configure: (proxy) => {
          proxy.on('error', (_err, _req, res) => {
            if (res && 'writeHead' in res && !(res as any).headersSent) {
              ;(res as any).writeHead(503, { 'Content-Type': 'application/json' })
              ;(res as any).end(
                JSON.stringify({
                  detail: 'Otix backend server is currently unavailable or restarting.',
                  code: 'backend_unavailable',
                }),
              )
            }
          })
        },
      },
      '/uploads': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:8000',
        changeOrigin: true,
        xfwd: true,
        configure: (proxy) => {
          proxy.on('error', (_err, _req, res) => {
            if (res && 'writeHead' in res && !(res as any).headersSent) {
              ;(res as any).writeHead(503, { 'Content-Type': 'application/json' })
              ;(res as any).end(JSON.stringify({ detail: 'Upload service unavailable' }))
            }
          })
        },
      },
      '/media': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:8000',
        changeOrigin: true,
        bypass: (req) => {
          // Browser navigations send Accept: text/html — serve index.html so the SPA handles routing
          if (req.headers.accept?.includes('text/html')) {
            return '/index.html'
          }
        },
        configure: (proxy) => {
          proxy.on('error', (_err, _req, res) => {
            if (res && 'writeHead' in res && !(res as any).headersSent) {
              ;(res as any).writeHead(503, { 'Content-Type': 'application/json' })
              ;(res as any).end(JSON.stringify({ detail: 'Media service unavailable' }))
            }
          })
        },
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/three')) return 'three'
          if (id.includes('node_modules/hls.js')) return 'hls'
          if (id.includes('node_modules/compromise')) return 'compromise'
          if (id.includes('node_modules/date-fns')) return 'date-fns'
          if (id.includes('node_modules/react-easy-crop')) return 'cropper'
          if (id.includes('node_modules/zod')) return 'zod'
          if (id.includes('node_modules/fuse.js')) return 'fuse'
          if (id.includes('node_modules/@floating-ui')) return 'floating-ui'
          if (id.includes('node_modules/framer-motion')) return 'framer-motion'
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) return 'react'
          if (id.includes('node_modules/@tanstack')) return 'tanstack'
          if (id.includes('node_modules/axios')) return 'axios'
          if (id.includes('node_modules/lucide-react')) return 'lucide'
          if (id.includes('chunk-reload')) return 'chunk-reload'
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
    css: true,
    exclude: ['node_modules/**', 'e2e/**', 'dist/**', '**/__snapshots__/**'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
})
