import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import type { UserConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  test: {
    // Use 'node' for utils (pure functions, no DOM needed).
    // Component tests should annotate with @vitest-environment happy-dom.
    environment: 'node',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['node_modules', 'dist'],
  } satisfies UserConfig['test'],
  plugins: [tailwindcss(), react()],
  server: {
    port: 5174,
    https: {
      key: fs.readFileSync('./localhost+2-key.pem'),
      cert: fs.readFileSync('./localhost+2.pem'),
    },
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/core', '@ffmpeg/core-mt', '@ffmpeg/util']
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
          ffmpeg: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
          video: ['video.js', 'videojs-hotkeys'],
          state: ['zustand']
        }
      },
      external: ['@ffmpeg/core', '@ffmpeg/core-mt']
    }
  }
})
