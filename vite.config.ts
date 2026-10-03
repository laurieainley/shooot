/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'

// https://vite.dev/config/
export default defineConfig({
  test: {
    // Use 'node' for utils (pure functions, no DOM needed).
    // Component tests should annotate with @vitest-environment happy-dom.
    environment: 'node',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['node_modules', 'dist'],
  },
  plugins: [tailwindcss(), react()],
  server: {
    port: 5174,
    https: {
      key: fs.readFileSync('./localhost+2-key.pem'),
      cert: fs.readFileSync('./localhost+2.pem'),
    },
  },
  build: {
    // Production optimizations
    target: 'es2020',
    minify: 'esbuild',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          // Separate vendor chunks for better caching
          vendor: ['react', 'react-dom'],
          media: ['mediabunny'],
          video: ['video.js', 'videojs-hotkeys'],
          state: ['zustand']
        }
      }
    }
  }
})
