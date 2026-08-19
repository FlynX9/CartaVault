import { useEffect, useRef, useState } from "react";

import { useI18n } from "../../i18n/useI18n";
import "./AppLoadingScreen.css";

export const SPLASH_SHOW_DELAY_MS = 250;
export const SPLASH_MIN_VISIBLE_MS = 500;
export const MAP_LOADING_SHOW_DELAY_MS = 400;

type LoadingMode = "app" | "map";

interface AppLoadingScreenProps {
  mode?: LoadingMode;
  message?: string;
  subMessage?: string;
  progress?: number | null;
}

/** A purely presentational, offline-safe loading surface. */
export function AppLoadingScreen({
  mode = "app",
  message,
  subMessage,
  progress = null,
}: AppLoadingScreenProps) {
  const { t } = useI18n();
  const title = message ?? t(mode === "app" ? "loading.app.title" : "loading.map.title");
  const subtitle = subMessage ?? t(mode === "app" ? "loading.app.subtitle" : "loading.map.subtitle");

  return (
    <section className={`app-loading-screen app-loading-screen--${mode}`} role="status" aria-live="polite" aria-label={title}>
      <div className="app-loading-screen__topography" aria-hidden="true" />
      <div className="app-loading-screen__content">
        <div className="app-loading-screen__mark" aria-hidden="true">
          <span className="app-loading-screen__ring app-loading-screen__ring--one" />
          <span className="app-loading-screen__ring app-loading-screen__ring--two" />
          <span className="app-loading-screen__ring app-loading-screen__ring--three" />
          <img src="/cartavault-loading-logo.png" alt="" />
        </div>
        <div className="app-loading-screen__copy">
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </div>
        {progress !== null && (
          <div className="app-loading-screen__progress" aria-label={`${Math.round(progress)}%`}>
            <i style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }} />
          </div>
        )}
      </div>
    </section>
  );
}

/** Delays a splash to prevent flashes, then keeps it visible long enough to read. */
export function useDelayedLoadingScreen(
  loading: boolean,
  showDelayMs = SPLASH_SHOW_DELAY_MS,
  minVisibleMs = SPLASH_MIN_VISIBLE_MS,
) {
  const [visible, setVisible] = useState(false);
  const shownAt = useRef<number | null>(null);

  useEffect(() => {
    if (loading) {
      const timer = window.setTimeout(() => {
        shownAt.current = performance.now();
        setVisible(true);
      }, showDelayMs);
      return () => window.clearTimeout(timer);
    }
    if (!visible) return;
    const elapsed = performance.now() - (shownAt.current ?? performance.now());
    const timer = window.setTimeout(() => {
      shownAt.current = null;
      setVisible(false);
    }, Math.max(0, minVisibleMs - elapsed));
    return () => window.clearTimeout(timer);
  }, [loading, minVisibleMs, showDelayMs, visible]);

  return visible;
}
