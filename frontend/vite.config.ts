import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
          if (id.includes('node_modules/@iconify')) return 'vendor-icons'
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
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
