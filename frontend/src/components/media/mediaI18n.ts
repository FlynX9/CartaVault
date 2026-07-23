const messages = {
  fr: {
    title: 'Médias',
    search: 'Rechercher un média, un lieu ou une carte…',
    empty: 'Aucun média ne correspond à ces critères.',
    loading: 'Chargement des médias…',
    filters: 'Filtres',
  },
  en: {
    title: 'Media',
    search: 'Search media, places, or maps…',
    empty: 'No media matches these criteria.',
    loading: 'Loading media…',
    filters: 'Filters',
  },
} as const

export function mediaMessages() {
  return navigator.language.toLowerCase().startsWith('fr') ? messages.fr : messages.en
}
