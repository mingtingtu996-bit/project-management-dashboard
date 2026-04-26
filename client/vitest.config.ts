/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    isolate: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,ts,jsx,tsx}'],
    deps: {
      optimizer: {
        client: {
          enabled: false,
          force: true,
          include: [
            'react',
            'react-dom',
            'react-router-dom',
            'lucide-react',
            '@radix-ui/react-dialog',
            '@radix-ui/react-slot',
            '@radix-ui/react-primitive',
            '@radix-ui/react-dismissable-layer',
            '@radix-ui/react-focus-scope',
            '@radix-ui/react-portal',
            '@radix-ui/react-presence',
            '@radix-ui/react-context',
          ],
        },
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts', 'src/test/**'],
    },
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      { find: '@', replacement: path.resolve(__dirname, './src') },
    ],
  },
})
