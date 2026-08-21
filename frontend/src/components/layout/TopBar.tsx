import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { BookOpen, Braces, ChevronDown, ExternalLink, FileText, LogOut, Mail, Moon, Rows2, Rows4, Settings2, ShieldCheck, Sun, UserRound, WifiOff } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { ACCOUNT_PREFERENCES_UPDATED_EVENT, accountAvatarUrl, getAccountPreferences, updateAccountPreferences } from "../../api/account";
import type { AccountPreferences } from "../../types/account";
import { applyDisplayDensity, parseDisplayDensity, saveDisplayDensity, type DisplayDensity } from "../../theme/displayDensity";
import { getSaasStatus } from "../../api/contact";
import { useAuth } from "../../auth/useAuth";
import { API_BASE_URL } from "../../config";
import { useI18n } from "../../i18n/useI18n";
import { useTheme } from "../../theme/useTheme";
import { AccountModal } from "../account/AccountModal";
import { ContactModal } from "../contact/ContactModal";
import { NotificationCenter } from "../notifications/NotificationCenter";
import { clearActionHistory } from "../../ui/actionHistory";
import { OfflineDownloadManager } from "../pwa/OfflineDownloadManager";
import { CARTAVAULT_VERSION } from "../../version";

interface TopBarProps {
  isMapWorkspace: boolean;
  panelLayoutScope?: string;
  contextLabel?: string;
  onMapAccessChanged: () => void;
  onOpenAdmin: () => void;
  onOpenRegistrationRequests: () => void;
}

const API_DOCUMENTATION_URL = /^https?:\/\//.test(API_BASE_URL) ? `${API_BASE_URL}/docs` : new URL(`${API_BASE_URL}/docs`, window.location.origin).toString();
const USER_DOCUMENTATION_URL = new URL("/docs/", window.location.origin).toString();
const ReleaseNotesModal = lazy(async () => ({
  default: (await import("../../pages/ReleaseNotesPage")).ReleaseNotesModal,
}));

export function TopBar({ isMapWorkspace, contextLabel, onMapAccessChanged, onOpenAdmin, onOpenRegistrationRequests }: TopBarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { resolvedTheme, toggleTheme } = useTheme();
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [releaseNotesOpen, setReleaseNotesOpen] = useState(false);
  const [saasEnabled, setSaasEnabled] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [preferences, setPreferences] = useState<AccountPreferences | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const avatar = accountAvatarUrl(user?.avatar_url ?? null);
  const nextThemeLabel = resolvedTheme === "dark" ? t("auth.theme.light") : t("auth.theme.dark");
  const closeAdminForAccount = () => {
    if (!location.pathname.startsWith("/admin")) return;
    navigate({ pathname: "/", search: location.search });
  };
  const handleLogout = async () => {
    setMenuOpen(false);
    try {
      await logout();
    } catch {
      // The local session is cleared by AuthProvider even if the server is unavailable.
    } finally {
      clearActionHistory();
      navigate("/login", { replace: true });
    }
  };

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    if (!location.pathname.startsWith("/admin")) return;
    setMenuOpen(false);
    setAccountOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    if (!user) {
      setSaasEnabled(false);
      return;
    }
    const controller = new AbortController();
    void getSaasStatus(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setSaasEnabled(value.enabled);
      })
      .catch(() => {
        if (!controller.signal.aborted) setSaasEnabled(false);
      });
    return () => controller.abort();
  }, [user?.id]);
  useEffect(() => {
    if (!user) { setPreferences(null); return; }
    const controller = new AbortController();
    void getAccountPreferences(controller.signal).then((value) => { if (!controller.signal.aborted) setPreferences(value); }).catch(() => undefined);
    const sync = (event: Event) => setPreferences((event as CustomEvent<AccountPreferences>).detail);
    window.addEventListener(ACCOUNT_PREFERENCES_UPDATED_EVENT, sync);
    return () => { controller.abort(); window.removeEventListener(ACCOUNT_PREFERENCES_UPDATED_EVENT, sync); };
  }, [user?.id]);
  const updateDensity = (density: DisplayDensity) => {
    if (!preferences) return;
    const next = { ...preferences, density };
    setPreferences(next);
    applyDisplayDensity(density);
    saveDisplayDensity(density, window.localStorage);
    window.dispatchEvent(new CustomEvent<AccountPreferences>(ACCOUNT_PREFERENCES_UPDATED_EVENT, { detail: next }));
    void updateAccountPreferences(next).then((saved) => {
      setPreferences(saved);
      window.dispatchEvent(new CustomEvent<AccountPreferences>(ACCOUNT_PREFERENCES_UPDATED_EVENT, { detail: saved }));
    }).catch(() => undefined);
  };
  const density = parseDisplayDensity(preferences?.density);
  const densityValue = Number(density);

  return (
    <header className="app-header">
      {user && <OfflineDownloadManager userId={user.id} />}
      <div className="brand-block">
        {!isMapWorkspace && <p className="app-eyebrow">{contextLabel ?? t("app.administration")}</p>}
        <h1 className="cartavault-wordmark">
          <span>Carta</span>
          <strong>Vault</strong>
        </h1>
        <small className="cartavault-version" title={`CartaVault ${CARTAVAULT_VERSION}`}>
          v{CARTAVAULT_VERSION}
        </small>
      </div>
      <nav className="app-header-actions" aria-label={t("topbar.mainNavigation")}>
        {!online && (
          <span className="marker-count offline-status" role="status">
            <WifiOff size={15} aria-hidden="true" />
            <span>{t("offline.status")}</span>
          </span>
        )}
        {user && (
          <div className="user-account-cluster">
            <div className="topbar-density-control" aria-label="Densité de l’interface">
              <button type="button" aria-label="Interface plus compacte" title="Interface plus compacte" disabled={densityValue <= 60} onClick={() => updateDensity(String(densityValue - 10) as DisplayDensity)}><Rows4 size={16} /></button>
              <input type="range" min="60" max="100" step="10" value={densityValue} aria-label="Densité de l’interface" title={`Densité de l’interface : ${densityValue} %`} onChange={(event) => updateDensity(event.target.value as DisplayDensity)} />
              <button type="button" aria-label="Interface plus espacée" title="Interface plus espacée" disabled={densityValue >= 100} onClick={() => updateDensity(String(densityValue + 10) as DisplayDensity)}><Rows2 size={16} /></button>
              <output title={`Densité de l’interface : ${densityValue} %`}>{densityValue}%</output>
            </div>
            <button className="topbar-theme-toggle" type="button" aria-label={nextThemeLabel} title={nextThemeLabel} aria-pressed={resolvedTheme === "dark"} onClick={toggleTheme}>
              <span className={`topbar-theme-toggle__choice${resolvedTheme === "light" ? " is-active" : ""}`}>
                <Sun size={17} aria-hidden="true" />
              </span>
              <span className={`topbar-theme-toggle__choice${resolvedTheme === "dark" ? " is-active" : ""}`}>
                <Moon size={17} aria-hidden="true" />
              </span>
            </button>
            <button className="topbar-theme-toggle-mobile panel-icon-button" type="button" aria-label={nextThemeLabel} title={nextThemeLabel} aria-pressed={resolvedTheme === "dark"} onClick={toggleTheme}>
              {resolvedTheme === "light" ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
            </button>
            <NotificationCenter userId={user.id} isAdmin={user.is_admin} onAccessChanged={onMapAccessChanged} onOpenRegistrationRequests={onOpenRegistrationRequests} />
            <div ref={menu} className="user-account-menu">
              <button
                ref={trigger}
                type="button"
                className="user-account-menu__trigger"
                aria-label={t("topbar.userMenuFor", {
                  name: user.display_name,
                })}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => {
                  closeAdminForAccount();
                  setMenuOpen((open) => !open);
                }}
              >
                <span className="user-account-menu__avatar" aria-hidden="true">
                  {avatar ? <img src={avatar} alt="" /> : <UserRound size={17} />}
                </span>
                <span className="user-account-menu__name">{user.display_name}</span>
                <ChevronDown className={menuOpen ? "open" : undefined} size={15} aria-hidden="true" />
              </button>
              {menuOpen && (
                <div className="user-account-menu__dropdown user-account-menu__dropdown--compact" role="menu" aria-label={t("topbar.userMenu")}>
                  <div className="user-account-menu__links">
                    <section className="user-account-menu__group" aria-labelledby="user-menu-account">
                      <p className="user-account-menu__section-label" id="user-menu-account">{t("topbar.accountSection")}</p>
                      <button
                        role="menuitem"
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          closeAdminForAccount();
                          setAccountOpen(true);
                        }}
                      >
                        <UserRound size={17} aria-hidden="true" />
                        {t("topbar.account")}
                      </button>
                      <button
                        role="menuitem"
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          closeAdminForAccount();
                          setAccountOpen(true);
                        }}
                      >
                        <Settings2 size={17} aria-hidden="true" />
                        {t("topbar.preferences")}
                      </button>
                      {saasEnabled && (
                        <button
                          role="menuitem"
                          type="button"
                          onClick={() => {
                            setMenuOpen(false);
                            setContactOpen(true);
                          }}
                        >
                          <Mail size={17} aria-hidden="true" />
                          {t("contact.menu")}
                        </button>
                      )}
                    </section>
                    <div className="user-account-menu__separator" role="separator" />
                    <section className="user-account-menu__group" aria-labelledby="user-menu-cartavault">
                      <p className="user-account-menu__section-label" id="user-menu-cartavault">{t("topbar.cartavaultSection")}</p>
                      {user.is_admin && (
                        <button
                          role="menuitem"
                          type="button"
                          onClick={() => {
                            setMenuOpen(false);
                            setAccountOpen(false);
                            onOpenAdmin();
                          }}
                        >
                          <ShieldCheck size={17} aria-hidden="true" />
                          {t("app.administration")}
                        </button>
                      )}
                      <a className="user-account-menu__documentation-link" role="menuitem" href={USER_DOCUMENTATION_URL} target="_blank" rel="noopener noreferrer" onClick={() => setMenuOpen(false)}>
                        <BookOpen size={17} aria-hidden="true" />
                        <span>{t("topbar.documentation")}</span>
                        <ExternalLink size={13} aria-hidden="true" />
                      </a>
                      <button
                        role="menuitem"
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          setAccountOpen(false);
                          setReleaseNotesOpen(true);
                        }}
                      >
                        <FileText size={17} aria-hidden="true" />
                        {t("topbar.releaseNotes")}
                      </button>
                    </section>
                    <div className="user-account-menu__separator" role="separator" />
                    <section className="user-account-menu__group" aria-labelledby="user-menu-developers">
                      <p className="user-account-menu__section-label" id="user-menu-developers">{t("topbar.developersSection")}</p>
                      <a className="user-account-menu__api-link" role="menuitem" href={API_DOCUMENTATION_URL} target="_blank" rel="noopener noreferrer" onClick={() => setMenuOpen(false)}>
                        <Braces size={17} aria-hidden="true" />
                        {t("topbar.api")}
                      </a>
                    </section>
                  </div>
                  <footer>
                    <button role="menuitem" type="button" onClick={() => void handleLogout()}>
                      <LogOut size={17} aria-hidden="true" />
                      {t("topbar.logout")}
                    </button>
                  </footer>
                </div>
              )}
            </div>
          </div>
        )}
      </nav>
      {accountOpen && <AccountModal trigger={trigger.current} onClose={() => setAccountOpen(false)} />}
      {contactOpen && <ContactModal onClose={() => setContactOpen(false)} />}
      {releaseNotesOpen && (
        <Suspense fallback={null}>
          <ReleaseNotesModal onClose={() => setReleaseNotesOpen(false)} />
        </Suspense>
      )}
    </header>
  );
}
