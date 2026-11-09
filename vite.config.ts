import { defineConfig, type Plugin } from 'vite'
import { spawn } from 'node:child_process'
import react from '@vitejs/plugin-react'
import path from 'path'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// Starts the invoice API next to the dev server, so one command runs the whole app.
function feeApi(): Plugin {
  return {
    name: 'fee-api',
    apply: 'serve',
    configureServer(server) {
      const child = spawn('bun', ['run', 'server/index.ts'], { stdio: 'inherit' })
      child.on('error', (error) => console.error('Could not start the API:', error.message))
      server.httpServer?.on('close', () => child.kill())
    },
  }
}

export default defineConfig({
  plugins: [react(), nodePolyfills(), feeApi()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      '@tanstack/react-query',
      'wagmi',
      'wagmi/chains',
      'wagmi/connectors',
      'viem',
      'viem/chains',
      'connectkit',
      'framer-motion',
      'lucide-react',
      'sonner',
      'clsx',
      'tailwind-merge',
      '@near-wallet-selector/core',
      '@near-wallet-selector/modal-ui',
      '@near-wallet-selector/my-near-wallet',
      '@near-wallet-selector/meteor-wallet',
      '@near-wallet-selector/here-wallet',
      '@near-js/transactions',
      'vite-plugin-node-polyfills/shims/buffer',
      'vite-plugin-node-polyfills/shims/global',
      'vite-plugin-node-polyfills/shims/process',
    ],
  },
  server: {
    allowedHosts: true,
    cors: true,
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
})
