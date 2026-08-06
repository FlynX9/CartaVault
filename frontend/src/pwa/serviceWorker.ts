export type ServiceWorkerUpdateHandler = (registration: ServiceWorkerRegistration) => void

/**
 * Registers the production service worker and reports only genuine updates.
 * The initial installation must remain silent, otherwise every first visit
 * would incorrectly look like an update awaiting confirmation.
 */
export function registerServiceWorker(onUpdate: ServiceWorkerUpdateHandler): () => void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return () => undefined

  let disposed = false
  let registration: ServiceWorkerRegistration | null = null

  const notifyIfUpdateIsWaiting = () => {
    if (!disposed && registration?.waiting && navigator.serviceWorker.controller) onUpdate(registration)
  }

  const onControllerChange = () => window.location.reload()
  navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

  void navigator.serviceWorker.register('/service-worker.js', { updateViaCache: 'none' })
    .then((nextRegistration) => {
      registration = nextRegistration
      notifyIfUpdateIsWaiting()
      nextRegistration.addEventListener('updatefound', () => {
        const worker = nextRegistration.installing
        if (!worker) return
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed') notifyIfUpdateIsWaiting()
        })
      })
    })
    .catch(() => {
      // Installation remains optional: the browser can still use CartaVault.
    })

  return () => {
    disposed = true
    navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
  }
}
