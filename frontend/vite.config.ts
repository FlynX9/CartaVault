import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendRoot = fileURLToPath(new URL('.', import.meta.url))
const documentationBuildRoot = resolve(frontendRoot, '..', 'website', 'dist')
const legacyCategoryIconIds = JSON.parse(readFileSync(new URL('../shared/category-icons.legacy.json', import.meta.url), 'utf8')) as string[]
const legacyCategoryIconModules = new Set(legacyCategoryIconIds.map((id) => {
  const [prefix, name] = id.split(':')
  return resolve(frontendRoot, 'node_modules', '@iconify-icons', prefix, `${name}.js`).replaceAll('\\', '/')
}))

function pwaPrecachePlugin(): Plugin {
  return {
    name: 'cartavault-pwa-precache',
    apply: 'build',
    closeBundle() {
      const outputDirectory = resolve(frontendRoot, 'dist')
      const assetsDirectory = resolve(outputDirectory, 'assets')
      const serviceWorkerPath = resolve(outputDirectory, 'service-worker.js')
      if (!existsSync(assetsDirectory) || !existsSync(serviceWorkerPath)) throw new Error('Le build PWA ne contient pas les ressources attendues.')

      const collectAssets = (directory: string, prefix = ''): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
        return entry.isDirectory() ? collectAssets(resolve(directory, entry.name), relativePath) : [`/assets/${relativePath}`]
      })
      const buildAssets = collectAssets(assetsDirectory).sort()
      const buildId = createHash('sha256').update(buildAssets.join('\n')).digest('hex').slice(0, 12)
      const source = readFileSync(serviceWorkerPath, 'utf8')
      const generated = source
        .replace("const BUILD_ID = 'development'", `const BUILD_ID = '${buildId}'`)
        .replace('const BUILD_ASSETS = []', `const BUILD_ASSETS = ${JSON.stringify(buildAssets, null, 2)}`)
      if (generated === source) throw new Error('Les marqueurs de précache PWA sont absents du service worker.')
      writeFileSync(serviceWorkerPath, generated)
    },
  }
}

const documentationContentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.pagefind': 'application/octet-stream',
  '.pf_filter': 'application/octet-stream',
  '.pf_fragment': 'application/octet-stream',
  '.pf_index': 'application/octet-stream',
  '.pf_meta': 'application/octet-stream',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
}

function documentationDevServerPlugin(): Plugin {
  const mounts = [
    ['/docs/', resolve(documentationBuildRoot, 'docs')],
    ['/_astro/', resolve(documentationBuildRoot, '_astro')],
    ['/pagefind/', resolve(documentationBuildRoot, 'pagefind')],
    ['/images/', resolve(documentationBuildRoot, 'images')],
  ] as const

  return {
    name: 'cartavault-documentation-dev-server',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.method !== 'GET' && request.method !== 'HEAD') return next()

        const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)
        if (pathname === '/docs') {
          response.statusCode = 308
          response.setHeader('Location', '/docs/')
          response.end()
          return
        }

        const mount = mounts.find(([prefix]) => pathname.startsWith(prefix))
        if (!mount) return next()
        const [prefix, root] = mount
        if (!existsSync(root)) {
          response.statusCode = 503
          response.setHeader('Content-Type', 'text/plain; charset=utf-8')
          response.end('Documentation indisponible. Exécutez npm run docs:build dans website.')
          return
        }

        const relativePath = pathname.slice(prefix.length)
        let filePath = resolve(root, relativePath)
        if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
          response.statusCode = 400
          response.end('Invalid documentation path')
          return
        }
        if (existsSync(filePath) && statSync(filePath).isDirectory()) filePath = resolve(filePath, 'index.html')
        if (!existsSync(filePath) || !statSync(filePath).isFile()) return next()

        response.statusCode = 200
        response.setHeader('Cache-Control', 'no-store')
        response.setHeader('Content-Type', documentationContentTypes[extname(filePath)] ?? 'application/octet-stream')
        if (request.method === 'HEAD') response.end()
        else response.end(readFileSync(filePath))
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [documentationDevServerPlugin(), react(), pwaPrecachePlugin()],
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
