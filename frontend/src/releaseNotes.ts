// Release builds inject VITE_CARTAVAULT_VERSION. The fallback keeps local,
// offline development builds on the release notes bundled with this frontend.
const BUNDLED_RELEASE_VERSION = "1.0.0-rc.5";

export const CARTAVAULT_VERSION =
  import.meta.env.VITE_CARTAVAULT_VERSION?.trim() || BUNDLED_RELEASE_VERSION;

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
