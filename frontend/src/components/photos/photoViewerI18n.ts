const messages = {
  fr: {
    title: 'Photos du lieu',
    close: 'Fermer la visionneuse',
    previous: 'Photo précédente',
    next: 'Photo suivante',
    retry: 'Réessayer',
    loading: 'Chargement de la photo…',
    error: 'Cette photo ne peut pas être affichée.',
    main: 'Photo principale',
    view: 'Voir les photos',
    position: (current: number, total: number) => `Photo ${current} sur ${total}`,
  },
  en: {
    title: 'Place photos',
    close: 'Close photo viewer',
    previous: 'Previous photo',
    next: 'Next photo',
    retry: 'Retry',
    loading: 'Loading photo…',
    error: 'This photo cannot be displayed.',
    main: 'Main photo',
    view: 'View photos',
    position: (current: number, total: number) => `Photo ${current} of ${total}`,
  },
} as const

export function photoViewerMessages() {
  return navigator.language.toLowerCase().startsWith('fr') ? messages.fr : messages.en
}
