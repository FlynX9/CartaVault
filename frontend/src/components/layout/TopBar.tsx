interface TopBarProps {
  isMapWorkspace: boolean
  markerCount: number
}

export function TopBar({ isMapWorkspace, markerCount }: TopBarProps) {
  return <header className="app-header"><div className="brand-block"><p className="app-eyebrow">{isMapWorkspace ? 'Espace cartographique' : 'Administration'}</p><h1 className="cartavault-wordmark"><span>Carta</span><strong>Vault</strong></h1></div><nav className="app-header-actions" aria-label="Navigation principale">{isMapWorkspace && <div className="marker-count" aria-live="polite"><strong>{markerCount}</strong><span>marqueur{markerCount > 1 ? 's' : ''}</span></div>}</nav></header>
}
