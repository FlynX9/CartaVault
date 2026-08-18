import { CARTAVAULT_VERSION } from "./version";

export { CARTAVAULT_VERSION } from "./version";

type LocalizedText = {
  en: string;
  fr: string;
};

export interface ReleaseNotes {
  date: string;
  summary: LocalizedText;
  sections: Array<{
    title: LocalizedText;
    changes: LocalizedText[];
  }>;
}

/*
 * This data is compiled into the frontend served by the CartaVault container.
 * It is deliberately available without network access. Keep it aligned with
 * the matching CHANGELOG section and GitHub Release when preparing a version.
 */
const releaseNotesByVersion: Record<string, ReleaseNotes> = {
  "1.0.0": {
    date: "2026-08-18",
    summary: {
      fr: "Première version stable de CartaVault, consolidant la beta publique et les cinq release candidates 1.0.",
      en: "First stable CartaVault release, consolidating the public beta and five 1.0 release candidates.",
    },
    sections: [
      {
        title: { fr: "Cartes, lieux et sorties", en: "Maps, places, and trips" },
        changes: [
          { fr: "Cartes privées, lieux enrichis, catégories, tags, statuts, annotations persistantes, médias, corbeille et historique d’audit.", en: "Private maps, rich places, categories, tags, statuses, persistent annotations, media, trash, and audit history." },
          { fr: "Sorties multi-jours avec étapes, nuits, calcul et revue d’optimisation des itinéraires.", en: "Multi-day trips with stops, nights, route calculation, and optimization review." },
          { fr: "Import et export KML/KMZ, création depuis adresse, coordonnées ou médias géolocalisés, et export PDF configurable.", en: "KML/KMZ import and export, creation from address, coordinates, or geolocated media, and configurable PDF export." },
        ],
      },
      {
        title: { fr: "Cartographie, mobilité et hors ligne", en: "Maps, mobile, and offline" },
        changes: [
          { fr: "Fonds classique et satellite configurés indépendamment, avec intégrations Google, Stadia et Mapbox, repli résilient et gestion des restrictions régionales.", en: "Independently configured classic and satellite basemaps with Google, Stadia, and Mapbox integrations, resilient fallback, and regional restriction handling." },
          { fr: "Génération et installation de fonds vectoriels CartaVault, PWA installable et parcours tactiles adaptés au mobile.", en: "CartaVault vector-basemap generation and installation, installable PWA, and mobile-first touch workflows." },
          { fr: "Mesure de distance, données hors ligne par compte et mise à jour fiable de l’application après une montée de version.", en: "Distance measurement, per-account offline data, and reliable application updates after an upgrade." },
        ],
      },
      {
        title: { fr: "Médias, comptes et collaboration", en: "Media, accounts, and collaboration" },
        changes: [
          { fr: "Compression, limites d’envoi, récupération GPS EXIF/XMP et stockage S3 compatible optionnel pour les médias privés.", en: "Compression, upload limits, EXIF/XMP GPS recovery, and optional S3-compatible storage for private media." },
          { fr: "Invitations, transferts de propriété, préférences bilingues, authentification à deux facteurs TOTP ou par e-mail.", en: "Invitations, ownership transfer, bilingual preferences, and TOTP or email multi-factor authentication." },
        ],
      },
      {
        title: { fr: "Administration et fournisseurs", en: "Administration and providers" },
        changes: [
          { fr: "Revue des inscriptions, rôles, permissions, profils de quota, clés partagées, diagnostics, journal d’instance et contrôles de confidentialité.", en: "Registration review, roles, permissions, quota profiles, shared keys, diagnostics, instance logs, and privacy controls." },
          { fr: "Clés Google, Stadia, Mapbox et OpenRouteService chiffrées côté serveur avec comptabilisation des fournisseurs et limitations de trafic.", en: "Server-side encrypted Google, Stadia, Mapbox, and OpenRouteService keys with provider metering and traffic limits." },
        ],
      },
      {
        title: { fr: "Sécurité et exploitation", en: "Security and operations" },
        changes: [
          { fr: "Secrets de fournisseurs raster délivrés par sessions chiffrées renouvelées automatiquement, sans exposition dans le navigateur.", en: "Raster provider secrets issued through automatically renewed encrypted sessions, without browser exposure." },
          { fr: "Protection du pool PostgreSQL contre les rafales de tuiles, cache navigateur et clients HTTP bornés pour les fournisseurs.", en: "PostgreSQL pool protection against tile bursts, browser caching, and bounded HTTP clients for providers." },
          { fr: "Conteneurs non-root en lecture seule, attestations, SBOM, provenance et smoke tests de déploiement complets.", en: "Read-only non-root containers, attestations, SBOM, provenance, and full deployment smoke tests." },
        ],
      },
      {
        title: { fr: "Documentation et site", en: "Documentation and website" },
        changes: [
          { fr: "Documentation embarquée bilingue, sélecteur de langue, thème accessible sur mobile et notes de version disponibles hors ligne.", en: "Embedded bilingual documentation, language selector, mobile-accessible theme control, and offline release notes." },
          { fr: "Site public indexable avec URLs canoniques, hreflang, robots.txt, sitemap XML, politique de confidentialité et politique de cookies.", en: "Indexable public website with canonical URLs, hreflang, robots.txt, XML sitemap, privacy policy, and cookie policy." },
        ],
      },
    ],
  },
  "1.0.0-rc.5": {
    date: "2026-08-18",
    summary: {
      fr: "Cinquième release candidate de CartaVault 1.0.",
      en: "Fifth CartaVault 1.0 release candidate.",
    },
    sections: [
      {
        title: { fr: "Évolutions", en: "Changed" },
        changes: [
          {
            fr: "Les secrets des fournisseurs raster sont désormais délivrés par des sessions de tuiles chiffrées et renouvelées automatiquement.",
            en: "Raster provider secrets are now issued through encrypted, automatically renewed tile sessions.",
          },
          {
            fr: "La comptabilisation Google Map Tiles est maintenant bornée sous la capacité du pool SQLAlchemy.",
            en: "Google Map Tiles database accounting is bounded below the SQLAlchemy pool capacity.",
          },
        ],
      },
      {
        title: { fr: "Correctifs", en: "Fixed" },
        changes: [
          {
            fr: "Les rafales simultanées de tuiles Stadia, Mapbox et Google ne peuvent plus épuiser le pool de connexions PostgreSQL ni bloquer le reste de l’application.",
            en: "Concurrent Stadia, Mapbox, and Google tile bursts no longer exhaust the PostgreSQL connection pool and block the rest of the application.",
          },
          {
            fr: "Les sessions de base de données des requêtes sont finalisées sans attendre un thread AnyIO disponible.",
            en: "Request database sessions are finalized without waiting for a free AnyIO worker thread.",
          },
          {
            fr: "La revue, le rejet et l’attribution de quota des inscriptions en attente sont rétablis dans le nouvel écran d’administration des utilisateurs.",
            en: "Pending registration review, rejection, and quota assignment are restored in the redesigned administration user screen.",
          },
        ],
      },
    ],
  },
};

export function getReleaseNotes(version = CARTAVAULT_VERSION) {
  return releaseNotesByVersion[version] ?? null;
}

export function getReleaseNotesUrl(version = CARTAVAULT_VERSION) {
  return `https://github.com/FlynX9/CartaVault/releases/tag/v${encodeURIComponent(version)}`;
}
