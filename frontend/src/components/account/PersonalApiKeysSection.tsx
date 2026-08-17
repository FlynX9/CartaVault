import { useEffect, useMemo, useRef, useState, type WheelEvent } from "react";
import { createPortal } from "react-dom";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  Pencil,
  Play,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";

import {
  createPersonalApiKey,
  deletePersonalApiKey,
  getPersonalApiKeys,
  updatePersonalApiKey,
  verifyPersonalApiKey,
} from "../../api/account";
import { useI18n } from "../../i18n/useI18n";
import type { PersonalApiKey } from "../../types/account";
import { useConfirmDialog } from "../common/useConfirmDialog";

export function PersonalApiKeysSection() {
  const { t, locale } = useI18n();
  const [keys, setKeys] = useState<PersonalApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<PersonalApiKey | null | "new">(null);
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<
    "google" | "stadia" | "mapbox" | "openrouteservice"
  >("google");
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [busy, setBusy] = useState(false);
  const [detailsKey, setDetailsKey] = useState<PersonalApiKey | null>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const { confirm, confirmationDialog } = useConfirmDialog({
    overlayClassName: "account-admin-modal-overlay",
  });
  const load = () =>
    void getPersonalApiKeys()
      .then(setKeys)
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Impossible de charger les clés API.",
        ),
      )
      .finally(() => setLoading(false));
  useEffect(load, []);
  const personalKeys = keys.filter((key) => key.source !== "instance");
  const instanceKeys = keys.filter((key) => key.source === "instance");
  const metrics = useMemo(
    () => ({
      configured: keys.length,
      verified: keys.filter((key) => key.verified).length,
      errors: keys.filter((key) => !key.verified).length,
      lastActivity:
        keys
          .map((key) => key.last_used_at ?? key.verified_at)
          .filter((value): value is string => Boolean(value))
          .sort()
          .at(-1) ?? null,
    }),
    [keys],
  );
  const open = (key: PersonalApiKey | "new") => {
    setEditing(key);
    setName(key === "new" ? "" : key.name);
    setProvider(key === "new" ? "google" : key.provider);
    setSecret("");
    setShowSecret(false);
    setError(null);
    setNotice(null);
  };
  const save = async () => {
    if (!editing || !name.trim() || (editing === "new" && !secret.trim()))
      return;
    const creating = editing === "new";
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const key = creating
        ? await createPersonalApiKey({
            name: name.trim(),
            provider,
            api_key: secret.trim(),
          })
        : await updatePersonalApiKey(editing.id, {
            name: name.trim(),
            ...(secret.trim() ? { api_key: secret.trim() } : {}),
          });
      setKeys((items) =>
        creating
          ? [...items, key]
          : items.map((item) => (item.id === key.id ? key : item)),
      );
      setEditing(null);
      setNotice(
        creating
          ? `Clé API personnelle « ${key.name} » ajoutée.`
          : `Clé API personnelle « ${key.name} » modifiée.`,
      );
    } catch (reason) {
      const fallback = `Échec de ${creating ? "l’ajout" : "la modification"} de la clé API personnelle.`;
      setError(
        reason instanceof Error ? `${fallback} ${reason.message}` : fallback,
      );
    } finally {
      setBusy(false);
    }
  };
  const saveAndTest = async () => {
    if (!editing || !name.trim() || (editing === "new" && !secret.trim()))
      return;
    const creating = editing === "new";
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const key = creating
        ? await createPersonalApiKey({
            name: name.trim(),
            provider,
            api_key: secret.trim(),
          })
        : await updatePersonalApiKey(editing.id, {
            name: name.trim(),
            ...(secret.trim() ? { api_key: secret.trim() } : {}),
          });
      setKeys((items) =>
        creating
          ? [...items, key]
          : items.map((item) => (item.id === key.id ? key : item)),
      );
      setEditing(key);
      setSecret("");
      try {
        const verified = await verifyPersonalApiKey(key.id);
        setKeys((items) =>
          items.map((item) => (item.id === key.id ? verified : item)),
        );
        setNotice(
          `Clé API personnelle « ${key.name} » ${creating ? "ajoutée" : "modifiée"} et testée avec succès.`,
        );
      } catch (reason) {
        setError(
          reason instanceof Error
            ? `Échec du test de la clé API personnelle « ${key.name} » : ${reason.message}`
            : `Échec du test de la clé API personnelle « ${key.name} ». La clé reste enregistrée.`,
        );
        load();
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? `Échec de ${creating ? "l’ajout" : "la modification"} de la clé API personnelle : ${reason.message}`
          : `Échec de ${creating ? "l’ajout" : "la modification"} de la clé API personnelle.`,
      );
    } finally {
      setBusy(false);
    }
  };
  const test = async (key: PersonalApiKey) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const next = await verifyPersonalApiKey(key.id);
      setKeys((items) =>
        items.map((item) => (item.id === key.id ? next : item)),
      );
      setNotice(`Test de la clé API personnelle « ${key.name} » réussi.`);
    } catch (reason) {
      const fallback = `Échec du test de la clé API personnelle « ${key.name} ».`;
      setError(
        reason instanceof Error ? `${fallback} ${reason.message}` : fallback,
      );
      load();
    } finally {
      setBusy(false);
    }
  };
  const remove = async (key: PersonalApiKey) => {
    if (
      !(await confirm({
        title: "Supprimer cette clé API",
        message: `La clé « ${key.name} » ne pourra plus être utilisée par vos préférences.`,
        confirmLabel: "Supprimer",
        variant: "danger",
      }))
    )
      return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await deletePersonalApiKey(key.id);
      setKeys((items) => items.filter((item) => item.id !== key.id));
      setNotice(`Clé API personnelle « ${key.name} » supprimée.`);
    } catch (reason) {
      const fallback = `Échec de la suppression de la clé API personnelle « ${key.name} ».`;
      setError(
        reason instanceof Error ? `${fallback} ${reason.message}` : fallback,
      );
    } finally {
      setBusy(false);
    }
  };
  const handleCatalogWheel = (event: WheelEvent<HTMLElement>) => {
    const cards = cardsRef.current;
    if (
      !cards ||
      cards.scrollWidth <= cards.clientWidth ||
      Math.abs(event.deltaX) >= Math.abs(event.deltaY)
    )
      return;
    const unit =
      event.deltaMode === 1
        ? 32
        : event.deltaMode === 2
          ? cards.clientWidth
          : 1.6;
    const distance = event.deltaY * unit;
    const atStart = cards.scrollLeft <= 0;
    const atEnd = cards.scrollLeft + cards.clientWidth >= cards.scrollWidth - 1;
    if ((distance < 0 && atStart) || (distance > 0 && atEnd)) return;
    event.preventDefault();
    cards.scrollBy({ left: distance, behavior: "auto" });
  };
  return (
    <>
      <header className="account-content-heading">
        <p className="cv-workspace-panel__eyebrow">
          {t("account.apiCatalog.eyebrow")}
        </p>
        <h2>{t("account.apiKeys")}</h2>
        <span>{t("account.apiCatalog.description")}</span>
      </header>
      {error && (
        <div className="form-alert" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="account-success" role="status">
          {notice}
        </div>
      )}
      <section
        className="account-security-summary account-personal-api-summary"
        aria-label={t("account.apiCatalog.summary")}
      >
        <div className="account-api-summary">
          <Metric
            icon={KeyRound}
            value={metrics.configured}
            label={t("account.apiCatalog.registered")}
          />
          <Metric
            icon={Check}
            value={metrics.verified}
            label={t("account.apiCatalog.verifiedPlural")}
          />
          <Metric
            icon={TriangleAlert}
            value={metrics.errors}
            label={t("account.apiCatalog.errors")}
            tone="warning"
          />
          <Metric
            icon={CalendarDays}
            value={
              metrics.lastActivity
                ? formatDate(metrics.lastActivity, locale, false)
                : t("account.apiCatalog.never")
            }
            label={t("account.apiCatalog.lastActivity")}
          />
        </div>
      </section>
      {!loading && instanceKeys.length > 0 && (
        <section className="account-preference-card account-api-catalog account-api-catalog--instance">
          <header className="account-api-catalog__header">
            <div className="account-preference-card__heading">
              <span className="account-preference-card__icon">
                <ShieldCheck size={19} aria-hidden="true" />
              </span>
              <div>
                <h3>Clés fournies par l’instance</h3>
                <p>
                  Partagées en lecture seule par votre profil de quota. Vous
                  pouvez les associer aux services autorisés.
                </p>
              </div>
            </div>
          </header>
          <div className="account-api-catalog__cards">
            {instanceKeys.map((key) => (
              <ApiKeyCard
                key={key.id}
                item={key}
                busy={busy}
                onTest={test}
                onEdit={open}
                onDelete={remove}
                onDetails={setDetailsKey}
              />
            ))}
          </div>
        </section>
      )}
      <section
        className="account-preference-card account-api-catalog account-api-catalog--personal"
        onWheel={handleCatalogWheel}
      >
        <header className="account-api-catalog__header">
          <div className="account-preference-card__heading">
            <span className="account-preference-card__icon">
              <KeyRound size={19} aria-hidden="true" />
            </span>
            <div>
              <h3>{t("account.apiCatalog.myKeys")}</h3>
              <p>{t("account.apiCatalog.reuse")}</p>
            </div>
          </div>
          <button
            className="account-button account-button--primary"
            type="button"
            onClick={() => open("new")}
          >
            <Plus size={16} />
            {t("account.apiCatalog.add")}
          </button>
        </header>
        {loading ? (
          <p className="account-card-description">
            {t("account.apiCatalog.loading")}
          </p>
        ) : personalKeys.length === 0 ? (
          <p className="account-api-catalog__empty">
            {t("account.apiCatalog.empty")}
          </p>
        ) : (
          <div ref={cardsRef} className="account-api-catalog__cards">
            {personalKeys.map((key) => (
              <ApiKeyCard
                key={key.id}
                item={key}
                busy={busy}
                onTest={test}
                onEdit={open}
                onDelete={remove}
                onDetails={setDetailsKey}
              />
            ))}
          </div>
        )}
      </section>
      <aside className="account-security-advice account-api-key-note">
        <span>
          <Info size={22} aria-hidden="true" />
        </span>
        <div>
          <h3>{t("account.apiCatalog.reuseTitle")}</h3>
          <p>{t("account.apiCatalog.note")}</p>
        </div>
      </aside>
      {editing &&
        createPortal(
          <div
            className="account-api-key-dialog-overlay"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setEditing(null);
            }}
          >
            <section
              className="account-api-key-dialog"
              role="dialog"
              aria-modal="true"
              aria-label={
                editing === "new"
                  ? t("account.apiCatalog.newTitle")
                  : t("account.apiCatalog.editTitle")
              }
            >
              <header>
                <div>
                  <h3>
                    {editing === "new"
                      ? t("account.apiCatalog.newTitle")
                      : t("account.apiCatalog.editTitle")}
                  </h3>
                  <p>
                    {editing === "new"
                      ? t("account.apiCatalog.newDescription")
                      : t("account.apiCatalog.editDescription")}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={t("account.apiCatalog.close")}
                  onClick={() => setEditing(null)}
                >
                  <X size={18} />
                </button>
              </header>
              {error && (
                <div className="form-alert" role="alert">
                  {error}
                </div>
              )}
              <div className="account-api-key-dialog__fields">
                <label>
                  {t("account.apiCatalog.keyName")}
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={t("account.apiCatalog.keyNamePlaceholder")}
                    autoFocus
                  />
                </label>
                {editing === "new" && (
                  <fieldset>
                    <legend>{t("account.apiCatalog.type")}</legend>
                    <div className="account-api-key-provider-choice account-api-key-provider-choice--three">
                      <button
                        type="button"
                        className={provider === "google" ? "is-selected" : ""}
                        onClick={() => setProvider("google")}
                      >
                        <img
                          src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                          alt=""
                        />
                        Google
                      </button>
                      <button
                        type="button"
                        className={provider === "stadia" ? "is-selected" : ""}
                        onClick={() => setProvider("stadia")}
                      >
                        <img
                          src="https://www.stadiamaps.com/favicon.ico"
                          alt=""
                        />
                        Stadia
                      </button>
                      <button
                        type="button"
                        className={provider === "mapbox" ? "is-selected" : ""}
                        onClick={() => setProvider("mapbox")}
                      >
                        Mapbox
                      </button>
                      <button
                        type="button"
                        className={
                          provider === "openrouteservice" ? "is-selected" : ""
                        }
                        onClick={() => setProvider("openrouteservice")}
                      >
                        <img src="/brands/ors-logo.jpeg" alt="" />
                        ORS
                      </button>
                    </div>
                  </fieldset>
                )}
                <label className="account-api-key-dialog__secret">
                  {editing === "new"
                    ? t("account.apiCatalog.apiKey")
                    : t("account.apiCatalog.newApiKey")}
                  <span>
                    <input
                      type={showSecret ? "text" : "password"}
                      value={secret}
                      onChange={(event) => setSecret(event.target.value)}
                      placeholder={t("account.apiCatalog.secretPlaceholder")}
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      aria-label={
                        showSecret
                          ? t("account.apiCatalog.hide")
                          : t("account.apiCatalog.show")
                      }
                      onClick={() => setShowSecret((value) => !value)}
                    >
                      {showSecret ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </span>
                </label>
                <aside>
                  <ShieldCheck size={19} />
                  <p>{t("account.apiCatalog.security")}</p>
                </aside>
              </div>
              <footer>
                <button
                  className="account-button account-button--secondary"
                  type="button"
                  onClick={() => setEditing(null)}
                >
                  {t("account.apiCatalog.cancel")}
                </button>
                <button
                  className="account-button account-button--secondary"
                  type="button"
                  disabled={
                    busy ||
                    !name.trim() ||
                    (editing === "new" && !secret.trim())
                  }
                  onClick={() => void saveAndTest()}
                >
                  <Play size={15} />
                  {t("account.apiCatalog.test")}
                </button>
                <button
                  className="account-button account-button--primary"
                  type="button"
                  disabled={
                    busy ||
                    !name.trim() ||
                    (editing === "new" && !secret.trim())
                  }
                  onClick={() => void save()}
                >
                  <Save size={15} />
                  {t("account.apiCatalog.save")}
                </button>
              </footer>
            </section>
          </div>,
          document.body,
        )}
      {detailsKey &&
        createPortal(
          <div
            className="account-api-key-dialog-overlay"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setDetailsKey(null);
            }}
          >
            <section
              className="account-api-key-dialog account-api-key-error-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="api-key-error-title"
            >
              <header>
                <div>
                  <p>{t("account.apiCatalog.apiKey").toUpperCase()}</p>
                  <h3 id="api-key-error-title">
                    {t("account.apiCatalog.errorDetails")}
                  </h3>
                </div>
                <button
                  type="button"
                  aria-label={t("account.apiCatalog.close")}
                  onClick={() => setDetailsKey(null)}
                >
                  <X size={18} />
                </button>
              </header>
              <div className="account-api-key-error-dialog__content">
                <TriangleAlert size={22} />
                <dl>
                  <dt>{t("account.apiCatalog.key")}</dt>
                  <dd>{detailsKey.name}</dd>
                  <dt>{t("account.apiCatalog.provider")}</dt>
                  <dd>
                    {detailsKey.provider === "google"
                      ? "Google"
                      : detailsKey.provider === "stadia"
                        ? "Stadia"
                        : detailsKey.provider === "mapbox"
                          ? "Mapbox"
                          : "ORS"}
                  </dd>
                  <dt>{t("account.apiCatalog.httpStatus")}</dt>
                  <dd>
                    {detailsKey.last_error_status ??
                      t("account.apiCatalog.unavailable")}
                  </dd>
                  <dt>{t("account.apiCatalog.technicalCode")}</dt>
                  <dd>
                    <code>
                      {detailsKey.last_error_code ?? "API_KEY_TEST_FAILED"}
                    </code>
                  </dd>
                  <dt>{t("account.apiCatalog.message")}</dt>
                  <dd>
                    {detailsKey.last_error_message ??
                      t("account.apiCatalog.noDetails")}
                  </dd>
                  <dt>{t("account.apiCatalog.testDate")}</dt>
                  <dd>{formatDate(detailsKey.last_error_at, locale)}</dd>
                </dl>
              </div>
              <footer>
                <button
                  className="account-button account-button--secondary"
                  type="button"
                  onClick={() => setDetailsKey(null)}
                >
                  {t("account.apiCatalog.close")}
                </button>
              </footer>
            </section>
          </div>,
          document.body,
        )}
      {confirmationDialog}
    </>
  );
}

function Metric({
  icon: Icon,
  value,
  label,
  tone = "success",
}: {
  icon: typeof KeyRound;
  value: string | number;
  label: string;
  tone?: "success" | "warning";
}) {
  return (
    <article
      className={`account-api-summary__item account-personal-api-summary__item is-${tone}`}
    >
      <span className="account-api-summary__icon">
        <Icon size={17} aria-hidden="true" />
      </span>
      <div>
        <strong>{label}</strong>
        <b>
          {tone === "warning" ? (
            <>
              <TriangleAlert size={13} />
              {value}
            </>
          ) : (
            <>
              <CheckCircle2 size={13} />
              {value}
            </>
          )}
        </b>
      </div>
    </article>
  );
}
function ApiKeyCard({
  item,
  busy,
  onTest,
  onEdit,
  onDelete,
  onDetails,
}: {
  item: PersonalApiKey;
  busy: boolean;
  onTest: (item: PersonalApiKey) => void;
  onEdit: (item: PersonalApiKey) => void;
  onDelete: (item: PersonalApiKey) => void;
  onDetails: (item: PersonalApiKey) => void;
}) {
  const { t, locale } = useI18n();
  const errored = Boolean(item.last_error_code);
  const brand =
    item.provider === "google"
      ? {
          src: "https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg",
          alt: "Google",
        }
      : item.provider === "stadia"
        ? { src: "https://www.stadiamaps.com/favicon.ico", alt: "Stadia Maps" }
      : item.provider === "mapbox"
          ? { src: "/brands/mapbox-logo.svg", alt: "Mapbox" }
          : { src: "/brands/ors-logo.jpeg", alt: "ORS" };
  const label =
    item.provider === "google"
      ? "Google"
      : item.provider === "stadia"
        ? "Stadia"
        : item.provider === "mapbox"
          ? "Mapbox"
          : "ORS";
  return (
    <article className={`account-api-key-card${errored ? " is-error" : ""}`}>
      <header>
        <span className={`account-api-key-card__logo is-${item.provider}`}>
          <img src={brand.src} alt={brand.alt} />
        </span>
        <div>
          <h3>{item.name}</h3>
          <p>{label}</p>
        </div>
        <b
          className={errored ? "is-error" : item.verified ? "is-verified" : ""}
        >
          {errored
            ? t("account.apiCatalog.error")
            : item.verified
              ? t("account.apiCatalog.verified")
              : t("account.apiCatalog.toTest")}
        </b>
      </header>
      <div className="account-api-key-card__secret">••••••••{item.last4}</div>
      {item.source === "instance" && (
        <p className="account-api-key-card__instance-note">
          <ShieldCheck size={14} />
          Clé d’instance · {item.quota_profile_name}
        </p>
      )}
      {errored ? (
        <aside className="account-api-key-card__error">
          <TriangleAlert size={20} />
          <p>
            {item.provider === "google"
              ? t("account.apiCatalog.googleError")
              : item.provider === "stadia"
                ? t("account.apiCatalog.stadiaError")
                : t("account.apiCatalog.orsError")}
            <button type="button" onClick={() => onDetails(item)}>
              {t("account.apiCatalog.details")}
            </button>
          </p>
        </aside>
      ) : (
        <dl>
          <dt>{t("account.apiCatalog.verifiedOn")}</dt>
          <dd>{formatDate(item.verified_at, locale)}</dd>
          <dt>{t("account.apiCatalog.lastUse")}</dt>
          <dd>{formatDate(item.last_used_at, locale)}</dd>
        </dl>
      )}
      {item.editable ? (
        <footer>
          <button type="button" disabled={busy} onClick={() => onTest(item)}>
            <Play size={16} />
            {t("account.apiCatalog.test")}
          </button>
          <div className="account-api-key-card__actions">
            <button
              type="button"
              aria-label={`${t("account.apiCatalog.edit")} ${item.name}`}
              title={t("account.apiCatalog.edit")}
              onClick={() => onEdit(item)}
            >
              <Pencil size={15} />
            </button>
            <button
              className="danger"
              type="button"
              aria-label={`${t("account.apiCatalog.delete")} ${item.name}`}
              title={t("account.apiCatalog.delete")}
              onClick={() => void onDelete(item)}
            >
              <Trash2 size={15} />
            </button>
          </div>
        </footer>
      ) : (
        <footer>
          <span className="account-integration-state is-neutral">
            <ShieldCheck size={14} />
            Lecture seule
          </span>
        </footer>
      )}
    </article>
  );
}
function formatDate(value: string | null, locale: string, time = true): string {
  return value
    ? new Intl.DateTimeFormat(
        locale,
        time
          ? { dateStyle: "short", timeStyle: "short" }
          : { dateStyle: "short" },
      ).format(new Date(value))
    : locale === "en"
      ? "Never"
      : "Jamais";
}
