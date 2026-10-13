/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import path from 'node:path'

// A fingerprint of everything that decides what a rendered frame looks like (engine, painters, themes, fonts). The unit cache
// keys on it, so a deploy that changes any of these never reuses parts rendered by the old code.
function renderHash(): string {
    const h = createHash('sha256')
    const walk = (dir: string): void => {
        if (!fs.existsSync(dir)) return
        for (const name of fs.readdirSync(dir).sort()) {
            const p = path.join(dir, name)
            if (fs.statSync(p).isDirectory()) walk(p)
            else if (!/\.test\.tsx?$/.test(name)) h.update(p).update(fs.readFileSync(p))
        }
    }
    for (const d of ['src/render', 'src/graphics', 'public/fonts', 'public/brand']) walk(d)
    return h.digest('hex').slice(0, 16)
}

// Local HTTPS dev certs (mkcert, gitignored). Absent in CI/Vercel, where only `vite build` runs.
const CERT_KEY = './localhost+2-key.pem'
const CERT = './localhost+2.pem'
const devHttps = fs.existsSync(CERT_KEY) && fs.existsSync(CERT)
    ? { key: fs.readFileSync(CERT_KEY), cert: fs.readFileSync(CERT) }
    : undefined

// https://vite.dev/config/
export default defineConfig({
  test: {
    // Use 'node' for utils (pure functions, no DOM needed).
    // Component tests should annotate with @vitest-environment happy-dom.
    environment: 'node',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Component tests can exceed the 5 s default on a loaded laptop; keep the suite deterministic.
    testTimeout: 20000,
    exclude: ['**/node_modules/**', 'dist', '.claude/**', 'video/**'],
  },
  plugins: [tailwindcss(), react()],
  define: { __RENDER_HASH__: JSON.stringify(renderHash()) },
  server: {
    port: 5174,
    https: devHttps,
  },
  build: {
    // Production optimizations
    target: 'es2020',
    minify: 'esbuild',
    sourcemap: false,
    rollupOptions: {
      // /bench is the on-device benchmark page (not linked from the editor).
      input: { main: fileURLToPath(new URL('./index.html', import.meta.url)), bench: fileURLToPath(new URL('./bench.html', import.meta.url)) },
      output: {
        manualChunks: {
          // Separate vendor chunks for better caching
          vendor: ['react', 'react-dom'],
          media: ['mediabunny'],
          video: ['video.js'],
          state: ['zustand']
        }
      }
    }
  }
})
