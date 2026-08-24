import { Check, Clock3, Copy, Download, ExternalLink, HardDriveDownload, LockKeyhole, Map, MapPin, Minus as IconMinimize, Pencil, Plus, Plus as IconMaximize, Route, Search, Settings, Settings2, Share2, Trash2, Users, X } from "lucide-react";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { acceptPendingMapInvitation, declinePendingMapInvitation, getPendingMapInvitations, updateMapPlaceFields } from "../../api/maps";
import { NOTIFICATIONS_CHANGED_EVENT, notifyNotificationsChanged } from "../notifications/events";
import { useI18n } from "../../i18n/useI18n";
import type { PendingMapInvitation, PoiMap } from "../../types/map";
import { CountryFlag } from "./CountryFlag";
import { CountryShapeThumbnail } from "./CountryShapeThumbnail";
import { CreateMapDialog } from "./CreateMapDialog";
import { MapNameDialog } from "./MapNameDialog";
import { SkeletonList } from "../common/Skeleton";
import { EmptyState } from "../common/EmptyState";
import { OfflinePackageDialog } from "../pwa/OfflinePackageDialog";
import { PanelWindowControls } from "../layout/PanelWindowControls";
import { FloatingPanelWindowContext } from "../layout/FloatingPanelWindow";

interface MapsWorkspacePanelProps {
  maps: PoiMap[];
  activeMapId: string | null;
  isLoading: boolean;
  errorMessage: string | null;
  onOpen: (mapId: string) => void;
  onCloseActive?: () => void;
  onDelete: (poiMap: PoiMap) => void;
  onCreated: (poiMap: PoiMap) => void;
  onUpdated?: (poiMap: PoiMap, mode: "rename" | "duplicate") => void;
  onExport?: (poiMap: PoiMap) => void;
  onMembers?: (poiMap: PoiMap) => void;
  onAccessChanged?: () => void;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  onClose?: () => void;
  createRequest?: number;
}

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase();

export function MapsWorkspacePanel({ maps, activeMapId, isLoading, errorMessage, onOpen, onCloseActive = () => undefined, onDelete, onCreated, onUpdated = () => undefined, onExport = () => undefined, onMembers = () => undefined, onAccessChanged = () => undefined, collapsed = false, onCollapsedChange, onClose, createRequest = 0 }: MapsWorkspacePanelProps) {
  const panelWindow = useContext(FloatingPanelWindowContext);
  const panelCollapsed = panelWindow?.desktop ? panelWindow.mode === "collapsed" : collapsed;
  const { t, formatDate } = useI18n();
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [invitations, setInvitations] = useState<PendingMapInvitation[]>([]);
  const [invitationError, setInvitationError] = useState<string | null>(null);
  const [busyInvitationId, setBusyInvitationId] = useState<string | null>(null);
  const [settingsMap, setSettingsMap] = useState<PoiMap | null>(null);
  const [offlineMap, setOfflineMap] = useState<PoiMap | null>(null);
  const [optionsMapId, setOptionsMapId] = useState<string | null>(null);
  const [nameDialog, setNameDialog] = useState<{ map: PoiMap; mode: "rename" | "duplicate" } | null>(null);
  const createButton = useRef<HTMLButtonElement>(null);
  const invitationController = useRef<AbortController | null>(null);
  useEffect(() => {
    if (createRequest > 0) setCreating(true);
  }, [createRequest]);
  useEffect(() => {
    const closeDialogs = () => {
      setCreating(false);
      setSettingsMap(null);
      setOfflineMap(null);
      setNameDialog(null);
    };
    window.addEventListener("cartavault:close-mobile-modal-layers", closeDialogs);
    return () => window.removeEventListener("cartavault:close-mobile-modal-layers", closeDialogs);
  }, []);
  useEffect(() => {
    if (optionsMapId === null) return
    const closeOutside = (event: PointerEvent) => {
      if (!(event.target as HTMLElement | null)?.closest('.maps-catalog__options-host')) setOptionsMapId(null)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOptionsMapId(null)
    }
    document.addEventListener('pointerdown', closeOutside)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [optionsMapId]);

  const loadInvitations = useCallback(() => {
    invitationController.current?.abort();
    const controller = new AbortController();
    invitationController.current = controller;
    void getPendingMapInvitations(controller.signal)
      .then((pending) => {
        setInvitations(pending);
        setInvitationError(null);
      })
      .catch((caught: unknown) => {
        if (!(caught instanceof Error && caught.name === "AbortError")) {
          setInvitationError(caught instanceof Error ? caught.message : t("maps.invitation.loadError"));
        }
      })
      .finally(() => {
        if (invitationController.current === controller) invitationController.current = null;
      });
  }, [t]);

  useEffect(() => {
    loadInvitations();
    const refresh = () => loadInvitations();
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh);
    return () => {
      invitationController.current?.abort();
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh);
    };
  }, [loadInvitations]);

  const search = normalize(query.trim());
  const filteredMaps = useMemo(() => (search === "" ? maps : maps.filter((poiMap) => normalize(`${poiMap.name} ${poiMap.country.name}`).includes(search))), [maps, search]);
  const filteredInvitations = useMemo(() => (search === "" ? invitations : invitations.filter((invitation) => normalize(`${invitation.map_name} ${invitation.invited_by_display_name}`).includes(search))), [invitations, search]);
  const totalCount = maps.length + invitations.length;
  const closeCreateDialog = () => {
    setCreating(false);
    window.setTimeout(() => createButton.current?.focus(), 0);
  };

  const decideInvitation = async (invitation: PendingMapInvitation, decision: "accept" | "decline") => {
    if (busyInvitationId !== null) return;
    setBusyInvitationId(invitation.id);
    setInvitationError(null);
    try {
      if (decision === "accept") await acceptPendingMapInvitation(invitation.id);
      else await declinePendingMapInvitation(invitation.id);
      setInvitations((current) => current.filter((item) => item.id !== invitation.id));
      notifyNotificationsChanged();
      if (decision === "accept") onAccessChanged();
    } catch (caught) {
      setInvitationError(caught instanceof Error ? caught.message : t("maps.invitation.actionError"));
    } finally {
      setBusyInvitationId(null);
    }
  };

  return (
    <aside id="workspace-maps-panel" className={`country-place-panel workspace-management-panel cv-workspace-panel maps-workspace-panel${panelCollapsed ? " is-collapsed" : ""}`} aria-labelledby="workspace-maps-title" tabIndex={-1}>
      <header className="cv-workspace-panel__header">
        <div className="cv-workspace-panel__heading">
          <p className="cv-workspace-panel__eyebrow">{t("maps.eyebrow")}</p>
          <h2 id="workspace-maps-title" className="cv-workspace-panel__title">
            {t("maps.title")}
          </h2>
        </div>
        <div className="cv-workspace-panel__header-actions">
          <span className="cv-workspace-panel__count">{t("maps.count", { count: totalCount })}</span>
          {!panelCollapsed && (
            <button ref={createButton} className="panel-icon-button primary panel-create-action" type="button" aria-label={t("maps.create")} title={t("maps.new")} onClick={() => setCreating(true)}>
              <Plus size={18} aria-hidden="true" />
              <span className="panel-create-action__label">{t("maps.new")}</span>
            </button>
          )}
          <PanelWindowControls />
          <button className="panel-icon-button workspace-panel-collapse-toggle mobile-panel-collapse-toggle" type="button" aria-label={collapsed ? "Agrandir le panneau" : "Réduire le panneau"} title={collapsed ? "Agrandir" : "Réduire"} aria-expanded={!collapsed} onClick={() => (onCollapsedChange ?? (() => onClose?.()))(!collapsed)}>
            {collapsed ? <IconMaximize size={18} aria-hidden="true" /> : <IconMinimize size={18} aria-hidden="true" />}
          </button>
        </div>
      </header>
      <div className="maps-workspace-panel__content">
        <label className="workspace-search-field">
          <Search aria-hidden="true" size={17} />
          <span className="visually-hidden">{t("maps.search")}</span>
          <input type="search" placeholder={t("maps.search")} value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        {(errorMessage || invitationError) && (
          <p className="form-alert" role="alert">
            {errorMessage ?? invitationError}
          </p>
        )}
        {isLoading && totalCount === 0 && <SkeletonList rows={4} label={t("maps.loading")} />}
        {!isLoading && totalCount === 0 && (
          <EmptyState
            className="maps-panel-empty"
            icon={<Map size={28} />}
            title={t("maps.empty")}
            action={{
              label: t("maps.create"),
              onClick: () => setCreating(true),
            }}
          />
        )}
        {!isLoading && totalCount > 0 && filteredMaps.length === 0 && filteredInvitations.length === 0 && <p className="place-list-message">{t("maps.noResult")}</p>}
        <ul className="maps-catalog" aria-label={t("maps.available")}>
          {filteredInvitations.map((invitation) => (
            <li className="maps-catalog__invitation" key={`invitation-${invitation.id}`}>
              <div
                className="maps-catalog__preview"
                aria-label={t("maps.invitation.preview", {
                  name: invitation.map_name,
                })}
                role="img"
              >
                <Map size={28} />
                <span>INV</span>
              </div>
              <div className="maps-catalog__details">
                <span className="maps-catalog__privacy shared" aria-label={t("maps.invitation.shared")} title={t("maps.invitation.shared")}>
                  <Share2 size={15} />
                </span>
                <strong>{invitation.map_name}</strong>
                <span>
                  {t("maps.invitation.by", {
                    name: invitation.invited_by_display_name,
                  })}
                </span>
                <em>{invitation.role === "owner" ? t("maps.invitation.owner") : invitation.role === "editor" ? t("maps.invitation.editor") : t("maps.invitation.viewer")}</em>
                <b>{t("maps.invitation.pending")}</b>
              </div>
              <div className="maps-catalog__actions maps-catalog__invitation-actions">
                <button type="button" className="secondary-button" disabled={busyInvitationId !== null} onClick={() => void decideInvitation(invitation, "decline")}>
                  {t("maps.invitation.decline")}
                </button>
                <button type="button" className="primary-button" disabled={busyInvitationId !== null} onClick={() => void decideInvitation(invitation, "accept")}>
                  <Check size={14} />
                  {t("maps.invitation.accept")}
                </button>
              </div>
            </li>
          ))}
          {filteredMaps.map((poiMap) => (
            <li className={`maps-catalog__card${poiMap.id === activeMapId ? " active" : ""}`} key={poiMap.id}>
              <div className="maps-catalog__summary">
                <div
                  className="maps-catalog__preview"
                  aria-label={t("maps.flagPreview", {
                    country: poiMap.country.name,
                    name: poiMap.name,
                  })}
                  role="img"
                >
                  <CountryShapeThumbnail countryCode={poiMap.country.iso_alpha3} />
                </div>
                <div className="maps-catalog__details">
                  <span className={`maps-catalog__privacy${poiMap.is_shared ? " shared" : ""}`} aria-label={poiMap.is_shared ? t("maps.shared") : t("maps.private")} title={poiMap.is_shared ? t("maps.shared") : t("maps.private")}>
                    {poiMap.is_shared ? <Share2 size={15} /> : <LockKeyhole size={15} />}
                  </span>
                  <div className="maps-catalog__title"><CountryFlag countryCode={poiMap.country.iso_alpha2} className="maps-catalog__flag" /><span className="maps-catalog__title-copy"><strong>{poiMap.name}</strong><small>{poiMap.country.name}</small></span></div>
                  <span>{t('maps.createdOn', { date: poiMap.created_at ? formatDate(poiMap.created_at, { dateStyle: 'medium' }) : t('common.notAvailable') })} · {t(`maps.role.${poiMap.current_user_role === "owner" || poiMap.current_user_role === "editor" || poiMap.current_user_role === "viewer" ? poiMap.current_user_role : "admin"}`)}</span>
                  <div className="maps-catalog__metrics">
                    <span>
                      <MapPin size={16} aria-hidden="true" />
                      {t("maps.placeCount", { count: poiMap.place_count })}
                    </span>
                    <span>
                      <Route size={16} aria-hidden="true" />
                      {t("maps.tripCount", { count: poiMap.trip_count })}
                    </span>
                    <span><Clock3 size={16} aria-hidden="true" />{t('maps.updatedOn', { date: poiMap.updated_at ? formatDate(poiMap.updated_at, { dateStyle: 'medium' }) : t('common.notAvailable') })}</span>
                  </div>
                  {(poiMap.current_user_role === "editor" || poiMap.current_user_role === "viewer") && poiMap.owner_email && <em className="maps-catalog__owner">{poiMap.owner_display_name || poiMap.owner_email}</em>}
                  <div className="maps-catalog__actions">
                    <button type="button" className={`secondary-button maps-catalog__open${poiMap.id === activeMapId ? ' maps-catalog__close' : ''}`} aria-label={poiMap.id === activeMapId ? t('common.close') : t("maps.openNamed", { name: poiMap.name })} onClick={() => poiMap.id === activeMapId ? onCloseActive() : onOpen(poiMap.id)}>{poiMap.id === activeMapId ? t('common.close') : t("maps.open")}<ExternalLink size={15} /></button>
                    {poiMap.can_export !== false && <button type="button" className="panel-icon-button" aria-label={t("maps.export", { name: poiMap.name })} title={t("maps.export", { name: poiMap.name })} onClick={() => onExport(poiMap)}><Download size={17} /></button>}
                    <div className="maps-catalog__options-host">
                      <button type="button" className="panel-icon-button" aria-label={t('maps.optionsNamed', { name: poiMap.name })} title={t('maps.options')} aria-expanded={optionsMapId === poiMap.id} onClick={() => setOptionsMapId((current) => current === poiMap.id ? null : poiMap.id)}><Settings size={17} /></button>
                      {optionsMapId === poiMap.id && <div className="maps-catalog__options-menu" role="menu" aria-label={t('maps.optionsNamed', { name: poiMap.name })}>
                        <button type="button" role="menuitem" onClick={() => { setOptionsMapId(null); setOfflineMap(poiMap) }}><HardDriveDownload size={16} /><span>{t('maps.offline')}</span></button>
                         {poiMap.can_edit && <button type="button" role="menuitem" onClick={() => { setOptionsMapId(null); setSettingsMap(poiMap) }}><Settings2 size={16} /><span>{t("maps.fields")}</span></button>}
                         {poiMap.current_user_role === "owner" && <button type="button" role="menuitem" onClick={() => { setOptionsMapId(null); setNameDialog({ map: poiMap, mode: "rename" }) }}><Pencil size={16} /><span>{t("maps.rename.action")}</span></button>}
                         {poiMap.current_user_role === "owner" && <button type="button" role="menuitem" onClick={() => { setOptionsMapId(null); setNameDialog({ map: poiMap, mode: "duplicate" }) }}><Copy size={16} /><span>{t("maps.duplicate.action")}</span></button>}
                        {poiMap.can_manage_members && <button type="button" role="menuitem" onClick={() => { setOptionsMapId(null); onMembers(poiMap) }}><Users size={16} /><span>{t("maps.members")}</span></button>}
                        {poiMap.can_delete !== false && <button type="button" role="menuitem" className="danger" onClick={() => { setOptionsMapId(null); onDelete(poiMap) }}><Trash2 size={16} /><span>{t("maps.deleteNamed", { name: poiMap.name })}</span></button>}
                      </div>}
                    </div>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
      {creating && (
        <CreateMapDialog
          onClose={closeCreateDialog}
          onCreated={(poiMap) => {
            closeCreateDialog();
            onCreated(poiMap);
          }}
        />
      )}
      {settingsMap && <PlaceFieldSettingsDialog poiMap={settingsMap} onClose={() => setSettingsMap(null)} onSaved={onAccessChanged} />}
      {offlineMap && <OfflinePackageDialog map={offlineMap} onClose={() => setOfflineMap(null)} />}
      {nameDialog && <MapNameDialog map={nameDialog.map} mode={nameDialog.mode} onClose={() => setNameDialog(null)} onSaved={(poiMap) => { setNameDialog(null); onUpdated(poiMap, nameDialog.mode) }} />}
    </aside>
  );
}

const FIELD_LABELS: Record<string, string> = {
  description: "Description",
  region: "Région",
  condition: "État de conservation",
  danger_level: "Niveau de danger",
  links: "Liens externes",
  ratings: "Notations",
  favorite: "Favori",
};

export function PlaceFieldSettingsDialog({ poiMap, onClose, onSaved }: { poiMap: PoiMap; onClose: () => void; onSaved: () => void }) {
  const [fields, setFields] = useState<Record<string, boolean>>(() => Object.fromEntries(Object.keys(FIELD_LABELS).map((key) => [key, poiMap.place_field_config?.[key] !== false])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    try {
      setBusy(true);
      setError(null);
      await updateMapPlaceFields(poiMap.id, fields);
      onSaved();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Configuration impossible.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="cv-overlay" role="presentation">
      <section className="cv-modal map-action-dialog map-place-fields-dialog" role="dialog" aria-modal="true" aria-labelledby="map-place-fields-title">
        <header className="map-action-dialog__header">
          <div>
            <p className="cv-workspace-panel__eyebrow">Paramètres de la carte</p>
            <h2 id="map-place-fields-title">Champs des POI</h2>
            <span>Choisissez les informations visibles sur les fiches de cette carte.</span>
          </div>
          <button className="panel-icon-button" type="button" aria-label="Fermer" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="map-action-dialog__body">
          <p className="map-action-dialog__notice">Les valeurs existantes sont conservées lorsqu’un champ est masqué.</p>
          {error && (
            <p className="form-alert" role="alert">
              {error}
            </p>
          )}
          <div className="map-place-fields-grid">
            {Object.entries(FIELD_LABELS).map(([key, label]) => (
              <label key={key}>
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={fields[key] !== false}
                  onChange={(event) =>
                    setFields((current) => ({
                      ...current,
                      [key]: event.target.checked,
                    }))
                  }
                />
              </label>
            ))}
          </div>
        </div>
        <footer className="map-action-dialog__footer dialog-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            Annuler
          </button>
          <button className="primary-button" data-cv-save="true" type="button" disabled={busy} onClick={() => void save()}>
            {busy ? "Enregistrement…" : "Enregistrer"}
          </button>
        </footer>
      </section>
    </div>
  );
}
