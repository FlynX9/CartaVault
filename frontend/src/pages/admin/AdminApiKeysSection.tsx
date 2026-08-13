import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalendarDays,
  Check,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  LockKeyhole,
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
  createAdminApiKey,
  deleteAdminApiKey,
  getAdminApiKeys,
  updateAdminApiKey,
  verifyAdminApiKey,
} from "../../api/adminConsole";
import type { AdminApiKey } from "../../types/adminConsole";
import { useConfirmDialog } from "../../components/common/useConfirmDialog";
import { useI18n } from "../../i18n/useI18n";
import type { I18nContextValue } from "../../i18n/i18nContext";

type EditableProvider = "google" | "stadia" | "openrouteservice" | "resend";

export function AdminApiKeysSection() {
  const { t, locale } = useI18n();
  const [keys, setKeys] = useState<AdminApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminApiKey | "new" | null>(null);
  const [detailsKey, setDetailsKey] = useState<AdminApiKey | null>(null);
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<EditableProvider>("google");
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [busy, setBusy] = useState(false);
  const { confirm, confirmationDialog } = useConfirmDialog({ overlayClassName: 'account-admin-modal-overlay' });
  const load = () =>
    void getAdminApiKeys()
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
  const editableKeys = keys.filter((key) => key.editable);
  const metrics = useMemo(
    () => ({
      configured: keys.filter(
        (key) => key.provider !== "master" || key.verified,
      ).length,
      verified: keys.filter((key) => key.verified).length,
      errors: keys.filter(
        (key) => (key.provider !== "master" || key.verified) && !key.verified,
      ).length,
      lastActivity:
        keys
          .map((key) => key.last_used_at ?? key.verified_at)
          .filter((value): value is string => Boolean(value))
          .sort()
          .at(-1) ?? null,
    }),
    [keys],
  );
  const open = (key: AdminApiKey | "new") => {
    if (key !== "new" && !key.editable) return;
    setEditing(key);
    setName(key === "new" ? "" : key.name);
    setProvider(key === "new" ? "google" : (key.provider as EditableProvider));
    setSecret("");
    setShowSecret(false);
    setError(null);
    setNotice(null);
  };
  const persist = async () => {
    if (!editing || !name.trim() || (editing === "new" && !secret.trim()))
      return null;
    const key =
      editing === "new"
        ? await createAdminApiKey({
            name: name.trim(),
            provider,
            api_key: secret.trim(),
          })
        : await updateAdminApiKey(editing.id, {
            name: name.trim(),
            ...(secret.trim() ? { api_key: secret.trim() } : {}),
          });
    setKeys((items) =>
      editing === "new"
        ? [
            ...items.filter((item) => item.provider !== "master"),
            key,
            ...items.filter((item) => item.provider === "master"),
          ]
        : items.map((item) => (item.id === key.id ? key : item)),
    );
    return key;
  };
  const save = async () => {
    const creating = editing === "new";
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const key = await persist();
      if (key) {
        setEditing(null);
        setNotice(
          creating
            ? `Clé API d’instance « ${key.name} » ajoutée.`
            : `Clé API d’instance « ${key.name} » modifiée.`,
        );
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? `Échec de ${creating ? "l’ajout" : "la modification"} de la clé API d’instance. ${reason.message}`
          : `Échec de ${creating ? "l’ajout" : "la modification"} de la clé API d’instance.`,
      );
    } finally {
      setBusy(false);
    }
  };
  const saveAndTest = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const key = await persist();
      if (!key) return;
      setEditing(key);
      setSecret("");
      try {
        const tested = await verifyAdminApiKey(key.id);
        setKeys((items) =>
          items.map((item) => (item.id === key.id ? tested : item)),
        );
        setNotice(
          key.provider === "resend"
            ? `Test de la clé Resend « ${key.name} » réussi : e-mail envoyé à votre adresse administrateur.`
            : `Test de la clé API d’instance « ${key.name} » réussi.`,
        );
      } catch (reason) {
        setError(
          reason instanceof Error
            ? `Échec du test de la clé API d’instance « ${key.name} ». ${reason.message}`
            : `Échec du test de la clé API d’instance « ${key.name} ». La clé reste enregistrée.`,
        );
        load();
      }
    } catch (reason) {
      setError(
        reason instanceof Error ? `Échec de l’enregistrement de la clé API d’instance. ${reason.message}` : "Échec de l’enregistrement de la clé API d’instance.",
      );
    } finally {
      setBusy(false);
    }
  };
  const test = async (key: AdminApiKey) => {
    if (!key.editable) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const tested = await verifyAdminApiKey(key.id);
      setKeys((items) =>
        items.map((item) => (item.id === key.id ? tested : item)),
      );
      setNotice(
        key.provider === "resend"
          ? `Test de la clé Resend « ${key.name} » réussi : e-mail envoyé à votre adresse administrateur.`
          : `Test de la clé API d’instance « ${key.name} » réussi.`,
      );
    } catch (reason) {
      setError(reason instanceof Error ? `Échec du test de la clé API d’instance « ${key.name} ». ${reason.message}` : `Échec du test de la clé API d’instance « ${key.name} ».`);
      load();
    } finally {
      setBusy(false);
    }
  };
  const remove = async (key: AdminApiKey) => {
    if (
      !key.editable ||
      !(await confirm({
        title: "Supprimer cette clé API",
        message:
          key.provider === "resend"
            ? "Les e-mails CartaVault ne pourront plus être envoyés."
            : `La clé « ${key.name} » sera définitivement supprimée.`,
        confirmLabel: "Supprimer",
        variant: "danger",
      }))
    )
      return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await deleteAdminApiKey(key.id);
      setKeys((items) => items.filter((item) => item.id !== key.id));
      setNotice(`Clé API d’instance « ${key.name} » supprimée.`);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? `Échec de la suppression de la clé API d’instance « ${key.name} ». ${reason.message}`
          : `Échec de la suppression de la clé API d’instance « ${key.name} ».`,
      );
    } finally {
      setBusy(false);
    }
  };
  const resendExists = editableKeys.some((key) => key.provider === "resend");

  return (
    <section>
      <header className="account-content-heading">
        <p className="cv-workspace-panel__eyebrow">{t('admin.api.eyebrow')}</p>
        <h2>{t('admin.api.title')}</h2>
        <span>{t('admin.api.description')}</span>
      </header>
      {error && !editing && (
        <div className="form-alert" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="form-alert success" role="status">
          {notice}
        </div>
      )}
      <section
        className="account-security-summary account-personal-api-summary"
        aria-label={t('admin.api.summary')}
      >
        <div className="account-api-summary">
          <Metric
            icon={KeyRound}
            value={metrics.configured}
            label={t('account.apiCatalog.registered')}
          />
          <Metric icon={Check} value={metrics.verified} label={t('account.apiCatalog.verifiedPlural')} />
          <Metric
            icon={TriangleAlert}
            value={metrics.errors}
            label={t('account.apiCatalog.errors')}
            tone="warning"
          />
          <Metric
            icon={CalendarDays}
            value={
              metrics.lastActivity
                ? new Date(metrics.lastActivity).toLocaleDateString(locale)
                : t('account.apiCatalog.never')
            }
            label={t('account.apiCatalog.lastActivity')}
          />
        </div>
      </section>
      <section className="account-preference-card account-api-catalog admin-api-catalog">
        <header className="account-api-catalog__header">
          <div>
            <div className="account-preference-card__heading">
              <span className="account-preference-card__icon">
                <KeyRound size={19} />
              </span>
              <h3>{t('admin.api.instanceKeys')}</h3>
            </div>
            <p>{t('admin.api.instanceHelp')}</p>
          </div>
          <button
            className="account-button account-button--primary"
            type="button"
            onClick={() => open("new")}
          >
            <Plus size={16} />
            {t('account.apiCatalog.add')}
          </button>
        </header>
        {loading ? (
          <p className="account-card-description">{t('account.apiCatalog.loading')}</p>
        ) : keys.length === 0 ? (
          <p className="account-api-catalog__empty">
            {t('admin.api.empty')}
          </p>
        ) : (
          <div className="account-api-catalog__cards">
            {keys.map((key) => (
              <AdminKeyCard
                key={key.id}
                item={key}
                busy={busy}
                onTest={test}
                onEdit={open}
                onDelete={remove}
                onDetails={setDetailsKey}
                t={t}
              />
            ))}
          </div>
        )}
      </section>
      <aside className="account-api-key-note">
        <Info size={22} />
        <p>{t('admin.api.noteResend')}<br />{t('admin.api.noteMaster')}</p>
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
                  ? "Nouvelle clé API administrateur"
                  : "Modifier la clé API administrateur"
              }
            >
              <header>
                <div>
                  <h3>
                    {editing === "new"
                      ? "Nouvelle clé API"
                      : "Modifier la clé API"}
                  </h3>
                  <p>
                    Renseignez les informations pour{" "}
                    {editing === "new"
                      ? "ajouter une nouvelle clé d’instance."
                      : "mettre à jour cette clé."}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Fermer"
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
                  Nom de la clé
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Ex. Google global"
                    autoFocus
                  />
                </label>
                {editing === "new" && (
                  <fieldset>
                    <legend>Type</legend>
                    <div className="account-api-key-provider-choice admin-api-key-provider-choice">
                      <ProviderButton
                        provider="google"
                        selected={provider === "google"}
                        onClick={() => setProvider("google")}
                      />
                      <ProviderButton
                        provider="stadia"
                        selected={provider === "stadia"}
                        onClick={() => setProvider("stadia")}
                      />
                      <ProviderButton
                        provider="openrouteservice"
                        selected={provider === "openrouteservice"}
                        onClick={() => setProvider("openrouteservice")}
                      />
                      <ProviderButton
                        provider="resend"
                        selected={provider === "resend"}
                        disabled={resendExists}
                        onClick={() => setProvider("resend")}
                      />
                    </div>
                  </fieldset>
                )}
                <label className="account-api-key-dialog__secret">
                  {editing === "new"
                    ? "Clé API"
                    : "Nouvelle clé API (optionnel)"}
                  <span>
                    <input
                      type={showSecret ? "text" : "password"}
                      value={secret}
                      onChange={(event) => setSecret(event.target.value)}
                      placeholder={
                        provider === "resend"
                          ? "re_••••••••"
                          : "Saisissez votre clé API"
                      }
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      aria-label={
                        showSecret ? "Masquer la clé" : "Afficher la clé"
                      }
                      onClick={() => setShowSecret((value) => !value)}
                    >
                      {showSecret ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </span>
                </label>
                <aside>
                  <ShieldCheck size={19} />
                  <p>
                    Cette clé est stockée de manière sécurisée et chiffrée. Elle
                    ne sera jamais affichée après l’enregistrement.
                  </p>
                </aside>
              </div>
              <footer>
                <button
                  className="account-button account-button--secondary"
                  type="button"
                  onClick={() => setEditing(null)}
                >
                  Annuler
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
                  Tester
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
                  Enregistrer
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
              aria-labelledby="admin-api-error-title"
            >
              <header>
                <div>
                  <p>CLÉ API</p>
                  <h3 id="admin-api-error-title">Détails de l’erreur</h3>
                </div>
                <button
                  type="button"
                  aria-label="Fermer"
                  onClick={() => setDetailsKey(null)}
                >
                  <X size={18} />
                </button>
              </header>
              <div className="account-api-key-error-dialog__content">
                <TriangleAlert size={22} />
                <dl>
                  <dt>Clé</dt>
                  <dd>{detailsKey.name}</dd>
                  <dt>Fournisseur</dt>
                  <dd>{providerLabel(detailsKey.provider)}</dd>
                  <dt>Statut HTTP</dt>
                  <dd>{detailsKey.last_error_status ?? "Non disponible"}</dd>
                  <dt>Code technique</dt>
                  <dd>
                    <code>
                      {detailsKey.last_error_code ?? "API_KEY_TEST_FAILED"}
                    </code>
                  </dd>
                  <dt>Message</dt>
                  <dd>
                    {detailsKey.last_error_message ??
                      "Aucun détail supplémentaire."}
                  </dd>
                  <dt>Date du test</dt>
                  <dd>{formatDate(detailsKey.last_error_at)}</dd>
                </dl>
              </div>
              <footer>
                <button
                  className="account-button account-button--secondary"
                  type="button"
                  onClick={() => setDetailsKey(null)}
                >
                  Fermer
                </button>
              </footer>
            </section>
          </div>,
          document.body,
        )}
      {confirmationDialog}
    </section>
  );
}

function ProviderButton({
  provider,
  selected,
  disabled = false,
  onClick,
}: {
  provider: EditableProvider;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const brand = brandFor(provider);
  return (
    <button
      type="button"
      className={selected ? "is-selected" : ""}
      disabled={disabled}
      title={disabled ? "Une clé Resend est déjà configurée" : undefined}
      onClick={onClick}
    >
      {brand.src ? (
        <img src={brand.src} alt="" />
      ) : provider === "openrouteservice" ? (
        <img src="/brands/ors-logo.jpeg" alt="" />
      ) : provider === "resend" ? (
        <img src="/brands/resend-icon-black.svg" alt="" />
      ) : (
        <LockKeyhole size={18} />
      )}{" "}
      {providerLabel(provider)}
    </button>
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
        <Icon size={17} />
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
              <Check size={13} />
              {value}
            </>
          )}
        </b>
      </div>
    </article>
  );
}
function AdminKeyCard({
  item,
  busy,
  onTest,
  onEdit,
  onDelete,
  onDetails,
  t,
}: {
  item: AdminApiKey;
  busy: boolean;
  onTest: (item: AdminApiKey) => void;
  onEdit: (item: AdminApiKey) => void;
  onDelete: (item: AdminApiKey) => void;
  onDetails: (item: AdminApiKey) => void;
  t: I18nContextValue['t'];
}) {
  const errored = Boolean(item.last_error_code);
  const brand = brandFor(item.provider);
  return (
    <article
      className={`account-api-key-card${errored ? " is-error" : ""}${!item.editable ? " is-readonly" : ""}`}
    >
      <header>
        <span className={`account-api-key-card__logo is-${item.provider}`}>
          {brand.src ? (
            <img src={brand.src} alt={brand.alt} />
          ) : item.provider === "resend" ? (
            <img src="/brands/resend-icon-black.svg" alt="Resend" />
          ) : item.provider === "openrouteservice" ? (
            <img src="/brands/ors-logo.jpeg" alt="ORS" />
          ) : (
            <LockKeyhole size={24} />
          )}
        </span>
        <div>
          <h3 title={item.name}>
            {item.provider === "master" ? t('admin.api.masterKey') : item.name}
          </h3>
          <p>{providerLabel(item.provider)}</p>
        </div>
        <b
          className={errored ? "is-error" : item.verified ? "is-verified" : ""}
        >
          {errored ? t('account.apiCatalog.error') : item.verified ? t('account.apiCatalog.verified') : t('account.apiCatalog.toTest')}
        </b>
      </header>
      {item.provider !== "master" && (
        <div className="account-api-key-card__secret">
          {`••••••••${item.last4}`}
        </div>
      )}
      {errored ? (
        <aside className="account-api-key-card__error">
          <TriangleAlert size={20} />
          <p>
            {item.last_error_message ??
              t('admin.api.testFailed', { provider: providerLabel(item.provider) })}
            <button type="button" onClick={() => onDetails(item)}>
              {t('account.apiCatalog.details')}
            </button>
          </p>
        </aside>
      ) : (
        <dl>
          <dt>{t('account.apiCatalog.verifiedOn')}</dt>
          <dd>{formatDate(item.verified_at)}</dd>
          <dt>{t('account.apiCatalog.lastUse')}</dt>
          <dd>{formatDate(item.last_used_at)}</dd>
        </dl>
      )}
      <footer>
        {item.editable ? (
          <>
            <button type="button" disabled={busy} onClick={() => onTest(item)}>
              <Play size={16} />
              {item.provider === "resend" ? t('admin.api.sendTest') : t('account.apiCatalog.test')}
            </button>
            <div className="account-api-key-card__actions">
              <button
                type="button"
                aria-label={`Modifier ${item.name}`}
                title={t('account.apiCatalog.edit')}
                onClick={() => onEdit(item)}
              >
                <Pencil size={15} />
              </button>
              <button
                className="danger"
                type="button"
                aria-label={`Supprimer ${item.name}`}
                title={t('account.apiCatalog.delete')}
                onClick={() => void onDelete(item)}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </>
        ) : (
          <span className="admin-api-key-card__readonly">
            <LockKeyhole size={14} />
            {t('admin.api.readOnly')}
          </span>
        )}
      </footer>
    </article>
  );
}
function providerLabel(provider: AdminApiKey["provider"]) {
  return {
    google: "Google",
    stadia: "Stadia",
    openrouteservice: "ORS",
    resend: "Resend",
    master: "Infrastructure",
  }[provider];
}
function brandFor(provider: AdminApiKey["provider"]) {
  if (provider === "google")
    return {
      src: "https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg",
      alt: "Google",
    };
  if (provider === "stadia")
    return {
      src: "https://www.stadiamaps.com/favicon.ico",
      alt: "Stadia Maps",
    };
  return { src: "", alt: "" };
}
function formatDate(value: string | null, time = true) {
  return value
    ? new Intl.DateTimeFormat(
        "fr-FR",
        time
          ? { dateStyle: "short", timeStyle: "short" }
          : { dateStyle: "short" },
      ).format(new Date(value))
    : "Jamais";
}
