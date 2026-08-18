import { useEffect } from "react";
import { BookOpen, ExternalLink, FileText, GitBranch, PackageCheck, X } from "lucide-react";

import {
  CARTAVAULT_VERSION,
  getReleaseNotes,
  getReleaseNotesUrl,
} from "../releaseNotes";
import { useI18n } from "../i18n/useI18n";

const USER_DOCUMENTATION_URL = new URL("/docs/", window.location.origin).toString();

interface ReleaseNotesModalProps {
  onClose: () => void;
}

export function ReleaseNotesModal({ onClose }: ReleaseNotesModalProps) {
  const { locale, formatDate } = useI18n();
  const releaseNotes = getReleaseNotes();
  const isFrench = locale === "fr";
  const text = (value: { fr: string; en: string }) => value[locale];
  const releaseUrl = getReleaseNotesUrl();

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div
      className="release-notes-modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="release-notes-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="release-notes-title"
      >
        <button
          className="release-notes-modal__close"
          type="button"
          onClick={onClose}
          aria-label={isFrench ? "Fermer À propos" : "Close About"}
        >
          <X size={20} aria-hidden="true" />
        </button>
        <div className="release-notes-page">
      <section className="release-notes-page__hero">
        <span className="release-notes-page__eyebrow">
          <PackageCheck size={17} aria-hidden="true" />
          {isFrench ? "À propos de cette version" : "About this version"}
        </span>
        <div>
          <p className="release-notes-page__kicker">CartaVault</p>
          <h2 id="release-notes-title">
            {isFrench ? "Notes de version" : "Release notes"}
          </h2>
          <p>
            {releaseNotes
              ? text(releaseNotes.summary)
              : isFrench
                ? "Les notes détaillées de cette version ne sont pas intégrées à ce build."
                : "Detailed notes for this version are not embedded in this build."}
          </p>
        </div>
        <dl className="release-notes-page__version-card">
          <div>
            <dt>{isFrench ? "Version installée" : "Installed version"}</dt>
            <dd>v{CARTAVAULT_VERSION}</dd>
          </div>
          {releaseNotes && (
            <div>
              <dt>{isFrench ? "Publication" : "Published"}</dt>
              <dd>{formatDate(releaseNotes.date)}</dd>
            </div>
          )}
        </dl>
      </section>

      <div className="release-notes-page__content">
        <section className="release-notes-page__notes" aria-labelledby="release-notes-details">
          <div className="release-notes-page__section-heading">
            <FileText size={19} aria-hidden="true" />
            <div>
              <h3 id="release-notes-details">
                {isFrench ? "Ce qui change" : "What’s changed"}
              </h3>
              <p>
                {isFrench
                  ? "Contenu identique aux notes de publication de l’image CartaVault correspondante."
                  : "Same content as the release notes for the matching CartaVault image."}
              </p>
            </div>
          </div>
          {releaseNotes ? (
            releaseNotes.sections.map((section) => (
              <section className="release-notes-page__group" key={section.title.en}>
                <h4>{text(section.title)}</h4>
                <ul>
                  {section.changes.map((change) => (
                    <li key={change.en}>{text(change)}</li>
                  ))}
                </ul>
              </section>
            ))
          ) : (
            <p className="release-notes-page__empty">
              {isFrench
                ? "Consultez la publication officielle pour le détail de cette version."
                : "See the official release for details of this version."}
            </p>
          )}
        </section>

        <aside className="release-notes-page__resources" aria-label={isFrench ? "Ressources utiles" : "Useful resources"}>
          <h3>{isFrench ? "Ressources utiles" : "Useful resources"}</h3>
          <a href={releaseUrl} target="_blank" rel="noopener noreferrer">
            <GitBranch size={18} aria-hidden="true" />
            <span>
              <strong>{isFrench ? "Publication GitHub" : "GitHub release"}</strong>
              <small>{isFrench ? "Consulter la note officielle et l’historique complet." : "View the official note and complete history."}</small>
            </span>
            <ExternalLink size={15} aria-hidden="true" />
          </a>
          <a href={USER_DOCUMENTATION_URL} target="_blank" rel="noopener noreferrer">
            <BookOpen size={18} aria-hidden="true" />
            <span>
              <strong>{isFrench ? "Documentation" : "Documentation"}</strong>
              <small>{isFrench ? "Guides d’utilisation et de déploiement." : "Usage and deployment guides."}</small>
            </span>
            <ExternalLink size={15} aria-hidden="true" />
          </a>
        </aside>
      </div>
        </div>
      </section>
    </div>
  );
}
