import { ArrowLeft, Camera, Check, Factory, Landmark, Luggage, Map as MapIcon, MapPinned, Mountain, Route, Search, SlidersHorizontal, Utensils, X, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'

import { ApiError } from '../../api/client'
import { getCountries } from '../../api/countries'
import { createMap, getMapProfiles } from '../../api/maps'
import { useModalFocus } from '../../hooks/useModalFocus'
import { useI18n } from '../../i18n/useI18n'
import type { Country, PoiMap, StarterProfile, StarterProfileId, StarterProfileOptions } from '../../types/map'
import { CategoryIconPreview } from '../icons/CategoryIconPreview'
import { CountryFlag } from './CountryFlag'

interface CreateMapDialogProps { onClose: () => void; onCreated: (poiMap: PoiMap) => void }

const PROFILE_ICONS: Record<string, LucideIcon> = {
  map: MapIcon, factory: Factory, camera: Camera, luggage: Luggage, mountain: Mountain,
  landmark: Landmark, route: Route, utensils: Utensils, 'sliders-horizontal': SlidersHorizontal,
}
const INCLUDE_KEYS = {
  categories: 'maps.create.include.categories',
  tags: 'maps.create.include.tags',
  statuses: 'maps.create.include.statuses',
} as const

export function CreateMapDialog({ onClose, onCreated }: CreateMapDialogProps) {
  const { t } = useI18n()
  const [step, setStep] = useState<1 | 2>(1)
  const [query, setQuery] = useState('')
  const [countries, setCountries] = useState<Country[]>([])
  const [countryId, setCountryId] = useState('')
  const [name, setName] = useState('')
  const [profiles, setProfiles] = useState<StarterProfile[]>([])
  const [profileId, setProfileId] = useState<StarterProfileId>('general')
  const [options, setOptions] = useState<StarterProfileOptions>({ categories: true, tags: true, statuses: true })
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  useModalFocus({ dialogRef: dialog, initialFocusRef: searchInput, onEscape: onClose })

  useEffect(() => {
    const controller = new AbortController()
    void getMapProfiles(controller.signal).then(setProfiles).catch((caught: unknown) => {
      if (!(caught instanceof Error && caught.name === 'AbortError')) setError(t('maps.create.profileError'))
    })
    return () => controller.abort()
  }, [t])

  useEffect(() => {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      setIsLoading(true)
      void getCountries(query.trim() || undefined, controller.signal)
        .then(setCountries)
        .catch((caught: unknown) => {
          if (!(caught instanceof Error && caught.name === 'AbortError')) setError(caught instanceof Error ? caught.message : t('maps.create.catalogError'))
        })
        .finally(() => { if (!controller.signal.aborted) setIsLoading(false) })
    }, 250)
    return () => { window.clearTimeout(timeout); controller.abort() }
  }, [query, t])

  const selectedProfile = profiles.find((profile) => profile.id === profileId)
  const selectCountry = (country: Country) => { setCountryId(country.id); setName(country.name) }
  const selectProfile = (id: StarterProfileId) => setProfileId(id)
  const toggleOption = (key: keyof StarterProfileOptions) => setOptions((current) => ({ ...current, [key]: !current[key] }))
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (step === 1) { if (countryId && name.trim()) setStep(2); return }
    if (!countryId || !selectedProfile) return
    setIsSubmitting(true); setError(null)
    try {
      onCreated(await createMap({ country_id: countryId, name: name.trim() || undefined, starter_profile: profileId, profile_options: options }))
    } catch (caught) {
      setError(caught instanceof ApiError && caught.status === 409 ? t('maps.create.duplicate') : caught instanceof Error ? caught.message : t('maps.create.error'))
    } finally { setIsSubmitting(false) }
  }

  return createPortal(
    <div className="cv-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div ref={dialog} className="create-map-dialog cv-modal" data-step={step} role="dialog" aria-modal="true" aria-labelledby="create-map-title">
        <form onSubmit={(event) => void submit(event)}>
          <header className="create-map-dialog__header">
            <span className="create-map-dialog__header-icon"><MapPinned aria-hidden="true" /></span>
            <div><span>{t('maps.create.eyebrow')}</span><h2 id="create-map-title">{t('maps.create.title')}</h2><p>{step === 1 ? t('maps.create.description') : t('maps.create.profileDescription')}</p></div>
            <button type="button" onClick={onClose} aria-label={t('common.close')}><X aria-hidden="true" /></button>
          </header>
          {error && <p className="form-alert" role="alert">{error}</p>}
          {step === 1 ? <>
            <label className="form-field create-map-dialog__search"><span>{t('maps.create.countrySearch')}</span><span className="create-map-dialog__input"><Search aria-hidden="true" /><input ref={searchInput} type="search" value={query} placeholder={t('maps.create.countryPlaceholder')} onChange={(event) => setQuery(event.target.value)} /></span></label>
            <div className="country-results" role="listbox" aria-label={t('maps.create.countries')}>
              {isLoading ? <p className="country-results__message" role="status">{t('maps.create.countryLoading')}</p> : countries.length === 0 ? <p className="country-results__message">{t('maps.create.countryEmpty')}</p> : countries.map((country) => {
                const selected = country.id === countryId
                return <button className={selected ? 'selected' : ''} type="button" role="option" aria-selected={selected} key={country.id} onClick={() => selectCountry(country)}><span className="country-results__flag"><CountryFlag countryCode={country.iso_alpha2} fallbackSize={20} /></span><span className="country-results__identity"><strong>{country.name}</strong><small>{country.iso_alpha2} · {country.iso_alpha3}</small></span><span className="country-results__selection" aria-hidden="true">{selected && <Check />}</span></button>
              })}
            </div>
            <label className="form-field create-map-dialog__name"><span>{t('maps.create.name')}</span><input value={name} maxLength={120} required placeholder={t('maps.create.namePlaceholder')} onChange={(event) => setName(event.target.value)} /></label>
          </> : <section className="starter-profile-step">
            <div className="starter-profile-step__heading"><div><h3>{t('maps.create.profileTitle')}</h3><p>{t('maps.create.profileHelp')}</p></div><span>{t('maps.create.step', { current: '2', total: '2' })}</span></div>
            <div className="starter-profile-grid" role="radiogroup" aria-label={t('maps.create.profileTitle')}>
              {profiles.map((profile) => { const Icon = PROFILE_ICONS[profile.ui_icon] ?? MapIcon; const selected = profile.id === profileId; return <button key={profile.id} type="button" role="radio" aria-checked={selected} className={selected ? 'selected' : ''} onClick={() => selectProfile(profile.id)}><span className="starter-profile-card__icon"><Icon aria-hidden="true" /></span><span><strong>{profile.name}</strong><small>{profile.description}</small></span><span className="starter-profile-card__check" aria-hidden="true">{selected && <Check />}</span></button> })}
            </div>
            {selectedProfile && <div className="starter-profile-config">
              <fieldset disabled={profileId === 'custom'}><legend>{t('maps.create.include')}</legend>{(['categories', 'tags', 'statuses'] as const).map((key) => <label key={key}><input type="checkbox" checked={profileId !== 'custom' && options[key]} onChange={() => toggleOption(key)} /><span>{t(INCLUDE_KEYS[key])}</span><small>{selectedProfile[key].length}</small></label>)}</fieldset>
              {profileId !== 'custom' && <div className="starter-profile-preview">
                {options.categories && <ProfilePreview title={t('maps.create.include.categories')} items={selectedProfile.categories} kind="category" defaultLabel={t('maps.create.defaultStatus')} />}
                {options.tags && <ProfilePreview title={t('maps.create.include.tags')} items={selectedProfile.tags} kind="tag" defaultLabel={t('maps.create.defaultStatus')} />}
                {options.statuses && <ProfilePreview title={t('maps.create.include.statuses')} items={selectedProfile.statuses} kind="status" defaultLabel={t('maps.create.defaultStatus')} />}
              </div>}
            </div>}
          </section>}
          <div className="dialog-actions">
            <button className="secondary-button cv-action-button" type="button" onClick={() => step === 1 ? onClose() : setStep(1)}>{step === 2 && <ArrowLeft aria-hidden="true" />}{step === 1 ? t('common.cancel') : t('maps.create.back')}</button>
            <button className="primary-button cv-action-button is-primary" type="submit" disabled={!countryId || !name.trim() || (step === 2 && (!selectedProfile || isSubmitting))}><MapPinned aria-hidden="true" />{step === 1 ? t('maps.create.continue') : isSubmitting ? t('maps.create.submitting') : t('maps.create.submit')}</button>
          </div>
        </form>
      </div>
    </div>, document.body,
  )
}

type PreviewItem = StarterProfile['categories'][number] | StarterProfile['tags'][number] | StarterProfile['statuses'][number]

function ProfilePreview({ title, items, kind, defaultLabel }: { title: string; items: PreviewItem[]; kind: 'category' | 'tag' | 'status'; defaultLabel: string }) {
  return <section><h4>{title}<span>{items.length}</span></h4><ul>{items.map((item) => <li key={item.key}>{kind !== 'category' && 'color' in item && <span className="starter-profile-preview__color" style={{ backgroundColor: item.color }} />}{kind === 'category' && 'icon_id' in item && <CategoryIconPreview iconId={item.icon_id} size={16} showLabel={false} />}<span>{item.name}</span>{kind === 'status' && 'is_default' in item && item.is_default && <small>{defaultLabel}</small>}</li>)}</ul></section>
}
