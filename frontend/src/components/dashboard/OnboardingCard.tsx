import { CheckCircle2, Map, MapPin, Route, Shapes, Upload } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { getAccountPreferences, updateAccountPreferences } from '../../api/account'
import type { AccountPreferences } from '../../types/account'
import type { Dashboard } from '../../types/dashboard'
import type { PoiMap } from '../../types/map'

type Step = 'map' | 'place' | 'import' | 'trip' | 'organization'

const steps: Array<{ id: Step; title: string; description: string; Icon: typeof Map }> = [
  { id: 'map', title: 'Créez votre première carte', description: 'Choisissez son nom et son pays.', Icon: Map },
  { id: 'place', title: 'Ajoutez un premier lieu', description: 'Enregistrez un point qui compte pour vous.', Icon: MapPin },
  { id: 'import', title: 'Importez vos données', description: 'Ajoutez un fichier KML ou KMZ si vous en avez un.', Icon: Upload },
  { id: 'trip', title: 'Préparez un voyage', description: 'Regroupez vos étapes dans un itinéraire.', Icon: Route },
  { id: 'organization', title: 'Organisez vos lieux', description: 'Catégories, tags et statuts facilitent vos recherches.', Icon: Shapes },
]

export function OnboardingCard({ maps, dashboard, onCreateMap, onCreatePlace, onImportKmz, onCreateTrip }: {
  maps: PoiMap[]; dashboard: Dashboard; onCreateMap: () => void; onCreatePlace: (mapId: string) => void; onImportKmz: (mapId: string) => void; onCreateTrip: (mapId: string) => void
}) {
  const [preferences, setPreferences] = useState<AccountPreferences | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    void getAccountPreferences(controller.signal).then((value) => { if (!controller.signal.aborted) setPreferences(value) }).catch(() => undefined)
    return () => controller.abort()
  }, [])

  const persist = useCallback(async (next: AccountPreferences) => {
    setPreferences(next)
    setSaving(true)
    try { setPreferences(await updateAccountPreferences(next)) } catch { setPreferences(preferences) } finally { setSaving(false) }
  }, [preferences])
  const complete = (step: Step) => {
    if (!preferences || preferences.onboarding.completed_steps.includes(step)) return
    void persist({ ...preferences, onboarding: { ...preferences.onboarding, completed_steps: [...preferences.onboarding.completed_steps, step] } })
  }
  useEffect(() => {
    if (!preferences) return
    const automatic: Step[] = [
      ...(maps.length > 0 ? ['map' as const] : []),
      ...(dashboard.summary.places > 0 ? ['place' as const] : []),
      ...(dashboard.summary.trips > 0 ? ['trip' as const] : []),
    ]
    const missing = automatic.filter((step) => !preferences.onboarding.completed_steps.includes(step))
    if (missing.length) void persist({ ...preferences, onboarding: { ...preferences.onboarding, completed_steps: [...preferences.onboarding.completed_steps, ...missing] } })
  }, [dashboard.summary.places, dashboard.summary.trips, maps.length, persist, preferences])

  if (!preferences) return null
  const completed = preferences.onboarding.completed_steps
  const targetMap = maps.find((map) => map.can_edit) ?? null
  const allDone = steps.every((step) => completed.includes(step.id))
  const showCard = !preferences.onboarding.dismissed && !allDone
  const run = (step: Step) => {
    if (step === 'map') onCreateMap()
    if (step === 'place' && targetMap) onCreatePlace(targetMap.id)
    if (step === 'import' && targetMap) { complete('import'); onImportKmz(targetMap.id) }
    if (step === 'trip' && targetMap) onCreateTrip(targetMap.id)
    if (step === 'organization') complete('organization')
  }
  if (preferences.onboarding.dismissed) return null
  if (!showCard) return null
  return <section className="dashboard-onboarding" aria-labelledby="onboarding-title">
    <header><div><span>Bienvenue dans CartaVault</span><h2 id="onboarding-title">Configurez votre premier voyage</h2><p>Quelques étapes facultatives pour prendre vos repères. Vous pouvez les reprendre à tout moment.</p></div><button type="button" disabled={saving} onClick={() => void persist({ ...preferences, onboarding: { ...preferences.onboarding, dismissed: true } })}>Passer le guide</button></header>
    <ol>{steps.map(({ id, title, description, Icon }) => {
      const done = completed.includes(id)
      const disabled = (id === 'place' || id === 'import' || id === 'trip') && !targetMap
      return <li key={id} className={done ? 'done' : ''}><span>{done ? <CheckCircle2 aria-label="Terminé" /> : <Icon aria-hidden="true" />}</span><div><strong>{title}</strong><p>{description}</p></div>{!done && <button type="button" disabled={disabled || saving} onClick={() => run(id)}>{id === 'organization' ? 'Compris' : 'Commencer'}</button>}</li>
    })}</ol>
  </section>
}
