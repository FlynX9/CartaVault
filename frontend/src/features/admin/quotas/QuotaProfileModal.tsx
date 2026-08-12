import { Save, X } from 'lucide-react'
import { useCallback, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'

import { FieldHelp } from '../../../components/common/FieldHelp'
import { useConfirmDialog } from '../../../components/common/useConfirmDialog'
import { useModalFocus } from '../../../hooks/useModalFocus'
import type { QuotaKey, QuotaLimits, QuotaProfile, QuotaRegistryItem } from '../../../types/adminConsole'

const EMPTY_LIMITS: QuotaLimits = {
  maps_max: null, trips_total_max: null, storage_bytes_max: null, photos_total_max: null,
  memberships_total_max: null, pending_invitations_max: null, places_per_map_max: null,
  tags_per_map_max: null, categories_per_map_max: null, statuses_per_map_max: null,
  trips_per_map_max: null, members_per_map_max: null, pending_invitations_per_map_max: null,
  photos_per_place_max: null, links_per_place_max: null, days_per_trip_max: null, steps_per_day_max: null,
  image_upload_megabytes_max: null, image_dimension_max: null,
}

export type QuotaProfileDraft = { name: string; description: string; is_active: boolean; limits: QuotaLimits }
type TabId = 'general' | 'account' | 'maps' | 'trips' | 'media' | 'advanced'
type FieldErrors = Partial<Record<QuotaKey | 'name', string>>

const TABS: Array<{ id: TabId; label: string; keys: QuotaKey[] }> = [
  { id: 'general', label: 'Général', keys: [] },
  { id: 'account', label: 'Compte', keys: ['maps_max', 'memberships_total_max'] },
  { id: 'maps', label: 'Cartes & POI', keys: ['places_per_map_max', 'tags_per_map_max', 'categories_per_map_max', 'statuses_per_map_max', 'members_per_map_max'] },
  { id: 'trips', label: 'Sorties', keys: ['trips_total_max', 'trips_per_map_max', 'days_per_trip_max', 'steps_per_day_max'] },
  { id: 'media', label: 'Médias', keys: ['storage_bytes_max', 'photos_total_max', 'photos_per_place_max', 'image_upload_megabytes_max', 'image_dimension_max'] },
  { id: 'advanced', label: 'Avancé', keys: ['pending_invitations_max', 'pending_invitations_per_map_max', 'links_per_place_max'] },
]

export function quotaProfileDraft(profile?: QuotaProfile): QuotaProfileDraft {
  return profile
    ? { name: profile.name, description: profile.description ?? '', is_active: profile.is_active, limits: { ...profile.limits } }
    : { name: '', description: '', is_active: true, limits: { ...EMPTY_LIMITS } }
}

interface Props {
  profile: QuotaProfile | null
  registry: QuotaRegistryItem[]
  busy: boolean
  serverError: string | null
  onClose: () => void
  onSave: (draft: QuotaProfileDraft) => Promise<void>
}

export function QuotaProfileModal({ profile, registry, busy, serverError, onClose, onSave }: Props) {
  const initialDraft = useMemo(() => quotaProfileDraft(profile ?? undefined), [profile])
  const [draft, setDraft] = useState(initialDraft)
  const [activeTab, setActiveTab] = useState<TabId>('general')
  const [errors, setErrors] = useState<FieldErrors>({})
  const dialogRef = useRef<HTMLElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const { confirm, confirmationDialog } = useConfirmDialog()
  const system = profile?.is_system === true
  const dirty = JSON.stringify(draft) !== JSON.stringify(initialDraft)
  const customized = Object.values(draft.limits).filter((value) => value !== null).length
  const unlimited = registry.length - customized
  const closeStateRef = useRef({ busy, dirty })
  closeStateRef.current = { busy, dirty }

  const requestClose = useCallback(async () => {
    if (document.querySelector('[role="alertdialog"][aria-modal="true"]')) return
    if (closeStateRef.current.busy) return
    if (closeStateRef.current.dirty) {
      const discard = await confirm({
        title: 'Modifications non enregistrées',
        message: 'Des modifications n’ont pas été enregistrées. Voulez-vous quitter sans les conserver ?',
        confirmLabel: 'Quitter sans enregistrer',
        cancelLabel: 'Continuer l’édition',
      })
      if (!discard) return
    }
    onClose()
  }, [confirm, onClose])
  useModalFocus({ dialogRef, initialFocusRef: system ? undefined : nameRef, onEscape: () => void requestClose() })

  const tabForField = (field: keyof FieldErrors): TabId => field === 'name' ? 'general' : TABS.find((tab) => tab.keys.includes(field as QuotaKey))?.id ?? 'general'
  const validate = () => {
    const next: FieldErrors = {}
    if (!draft.name.trim()) next.name = 'Le nom du profil est obligatoire.'
    registry.forEach((item) => {
      const value = draft.limits[item.key]
      const minimum = item.unit === 'pixels' ? 1024 : item.unit === 'megabytes' ? 1 : item.minimum
      if (value !== null && (!Number.isFinite(value) || value < minimum || value > item.maximum)) {
        next[item.key] = `Saisissez une valeur comprise entre ${minimum.toLocaleString('fr-FR')} et ${item.maximum.toLocaleString('fr-FR')}.`
      }
    })
    setErrors(next)
    const first = Object.keys(next)[0] as keyof FieldErrors | undefined
    if (first) setActiveTab(tabForField(first))
    return Object.keys(next).length === 0
  }
  const submit = (event: FormEvent) => { event.preventDefault(); if (validate()) void onSave({ ...draft, name: draft.name.trim(), description: draft.description.trim() }) }
  const changeTab = (tab: TabId) => { setActiveTab(tab); window.requestAnimationFrame(() => tabRefs.current[TABS.findIndex((item) => item.id === tab)]?.focus()) }
  const navigateTabs = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length
    changeTab(TABS[next].id)
  }

  return createPortal(<div className="cv-overlay quota-profile-modal-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) void requestClose() }}>
    <section ref={dialogRef} className="cv-modal quota-profile-modal" role="dialog" aria-modal="true" aria-labelledby="quota-profile-modal-title">
      <form onSubmit={submit} noValidate>
        <header className="quota-profile-modal__header"><div><p className="cv-workspace-panel__eyebrow">CAPACITÉ</p><div className="quota-profile-modal__title"><h2 id="quota-profile-modal-title">{profile ? `Modifier ${profile.name}` : 'Nouveau profil de quotas'}</h2>{profile && <span className="quota-profile-modal__badges">{profile.is_default && <b>Par défaut</b>}{profile.is_system && <b>Système</b>}{profile.is_active && <b>Actif</b>}</span>}</div><p>{profile ? 'Gérez les limites et capacités associées à ce profil.' : 'Définissez les capacités et limites de ce profil.'}</p><small>{customized} limite{customized !== 1 ? 's' : ''} personnalisée{customized !== 1 ? 's' : ''} · {unlimited} illimitée{unlimited !== 1 ? 's' : ''}</small></div><button className="panel-icon-button" type="button" aria-label="Fermer" disabled={busy} onClick={() => void requestClose()}><X size={18} /></button></header>
        <div className="quota-profile-modal__tabs" role="tablist" aria-label="Catégories de quotas">{TABS.map((tab, index) => { const hasError = Object.keys(errors).some((field) => tabForField(field as keyof FieldErrors) === tab.id); return <button ref={(node) => { tabRefs.current[index] = node }} key={tab.id} type="button" role="tab" id={`quota-tab-${tab.id}`} aria-controls={`quota-panel-${tab.id}`} aria-selected={activeTab === tab.id} tabIndex={activeTab === tab.id ? 0 : -1} className={hasError ? 'has-error' : ''} onKeyDown={(event) => navigateTabs(event, index)} onClick={() => setActiveTab(tab.id)}>{tab.label}{hasError && <span aria-label="Contient une erreur" />}</button> })}</div>
        <div className="quota-profile-modal__body">{serverError && <p className="form-alert" role="alert">{serverError}</p>}{activeTab === 'general' ? <section className="quota-profile-general" role="tabpanel" id="quota-panel-general" aria-labelledby="quota-tab-general"><div className="quota-profile-general__fields"><div><label htmlFor="quota-profile-name">Nom</label><input id="quota-profile-name" ref={nameRef} required disabled={system} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'quota-name-error' : undefined} value={draft.name} onChange={(event) => { setDraft({ ...draft, name: event.target.value }); setErrors(({ name: _name, ...rest }) => rest) }} />{errors.name && <small className="quota-field-error" id="quota-name-error">{errors.name}</small>}</div><label>Description<textarea rows={4} maxLength={2000} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label></div><label className="quota-profile-active"><input type="checkbox" checked={draft.is_active} disabled={system || Boolean(profile?.is_default)} onChange={(event) => setDraft({ ...draft, is_active: event.target.checked })} /><span><strong>Profil actif</strong><small>{system ? 'Le profil système reste toujours actif.' : profile?.is_default ? 'Le profil par défaut doit rester actif.' : 'Un profil inactif ne peut plus être attribué à de nouveaux utilisateurs.'}</small></span></label>{system && <p className="quota-profile-modal__system-note">Le nom, l’état et les limites du profil système sont protégés. Sa description reste modifiable.</p>}</section> : <section role="tabpanel" id={`quota-panel-${activeTab}`} aria-labelledby={`quota-tab-${activeTab}`} className="quota-limit-list">{TABS.find((tab) => tab.id === activeTab)?.keys.map((key) => { const item = registry.find((candidate) => candidate.key === key); return item ? <QuotaLimitField key={key} item={item} value={draft.limits[key]} disabled={system} error={errors[key]} onChange={(value) => { setDraft({ ...draft, limits: { ...draft.limits, [key]: value } }); setErrors((current) => { const next = { ...current }; delete next[key]; return next }) }} /> : null })}</section>}</div>
        <footer className="quota-profile-modal__footer"><button className="secondary-button" type="button" disabled={busy} onClick={() => void requestClose()}>Annuler</button><button className="primary-button" data-cv-save="true" disabled={busy || system && !dirty} type="submit"><Save size={16} />{busy ? 'Enregistrement…' : profile ? 'Enregistrer' : 'Créer le profil'}</button></footer>
      </form>
      {confirmationDialog}
    </section>
  </div>, document.body)
}

function QuotaLimitField({ item, value, disabled, error, onChange }: { item: QuotaRegistryItem; value: number | null; disabled: boolean; error?: string; onChange: (value: number | null) => void }) {
  const storage = item.unit === 'bytes'
  const mediaFallback = item.unit === 'megabytes' || item.unit === 'pixels'
  const shown = value === null ? '' : storage ? value / 1024 ** 3 : value
  const defaultValue = item.unit === 'pixels' ? 2560 : item.unit === 'megabytes' ? 5 : 0
  const unit = storage ? 'Gio' : item.unit === 'count' ? 'éléments' : item.unit === 'megabytes' ? 'Mo' : 'px'
  const errorId = `quota-error-${item.key}`
  return <div className={`quota-limit-field ${value === null ? 'is-unlimited' : ''} ${error ? 'has-error' : ''}`}><div className="quota-limit-field__label"><strong>{item.label}<FieldHelp>{item.description}{!item.enforced ? ' · Non appliqué actuellement' : ''}</FieldHelp></strong><small>{item.description}</small></div><label className="quota-limit-field__unlimited"><input type="checkbox" checked={value === null} disabled={disabled} onChange={(event) => onChange(event.target.checked ? null : defaultValue)} /><span>{mediaFallback ? 'Réglage général' : 'Illimité'}</span></label><label className="quota-limit-field__value"><span className="sr-only">Valeur pour {item.label}</span><input type="number" min={item.unit === 'pixels' ? 1024 : item.unit === 'megabytes' ? 1 : item.minimum} max={storage ? undefined : item.maximum} disabled={disabled || value === null} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} value={shown} onChange={(event) => { const entered = Number(event.target.value); onChange(storage ? Math.round(entered * 1024 ** 3) : entered) }} /><em>{unit}</em></label>{error && <small className="quota-field-error" id={errorId}>{error}</small>}</div>
}
