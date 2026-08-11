import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendRoot = fileURLToPath(new URL('.', import.meta.url))
const legacyCategoryIconIds = JSON.parse(readFileSync(new URL('../shared/category-icons.legacy.json', import.meta.url), 'utf8')) as string[]
const legacyCategoryIconModules = new Set(legacyCategoryIconIds.map((id) => {
  const [prefix, name] = id.split(':')
  return resolve(frontendRoot, 'node_modules', '@iconify-icons', prefix, `${name}.js`).replaceAll('\\', '/')
}))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    manifest: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router-dom')) return 'vendor-react'
          if (id.includes('node_modules/leaflet') || id.includes('node_modules/react-leaflet')) return 'vendor-leaflet'
          if (id.includes('node_modules/maplibre-gl') || id.includes('node_modules/@maplibre')) return 'vendor-maplibre'
          const normalizedId = id.replaceAll('\\', '/').split('?')[0]!
          if (legacyCategoryIconModules.has(normalizedId)) return 'category-icons-legacy'
          if (id.includes('node_modules/@iconify/react')) return 'vendor-icons'
          return undefined
        },
      },
    },
  },
  server: {
    // The local development server is also used for real-device PWA checks on
    // the private Wi-Fi network. The API stays loopback-only behind this proxy.
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        // The standard local FastAPI development server listens on port 8000.
        // CARTAVAULT_DEV_API_URL remains available for an explicit override.
        target: process.env.CARTAVAULT_DEV_API_URL ?? 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
