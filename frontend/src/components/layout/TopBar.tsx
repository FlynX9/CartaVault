import { Link } from 'react-router-dom'

import { CountrySelector } from '../countries/CountrySelector'
import { withCountry } from '../../utils/country'

interface TopBarProps {
  isMapWorkspace: boolean
  countries: string[]
  activeCountry: string | null
  areCountriesLoading: boolean
  countriesError: string | null
  markerCount: number
  placeListOpen: boolean
  onCountryChange: (country: string | null) => void
  onTogglePlaceList: () => void
}

export function TopBar({
  isMapWorkspace,
  countries,
  activeCountry,
  areCountriesLoading,
  countriesError,
  markerCount,
  placeListOpen,
  onCountryChange,
  onTogglePlaceList,
}: TopBarProps) {
  return (
    <header className="app-header">
      <div className="brand-block">
        <p className="app-eyebrow">
          {isMapWorkspace ? "Carte des points d'intérêt" : 'Administration'}
        </p>
        <h1>POI Manager</h1>
      </div>

      {isMapWorkspace && (
        <CountrySelector
          countries={countries}
          activeCountry={activeCountry}
          isLoading={areCountriesLoading}
          errorMessage={countriesError}
          onChange={onCountryChange}
        />
      )}

      <nav className="app-header-actions" aria-label="Navigation principale">
        {isMapWorkspace && (
          <>
            <button
              className="header-link place-list-toggle"
              type="button"
              aria-expanded={placeListOpen}
              aria-controls="country-place-list"
              onClick={onTogglePlaceList}
            >
              {placeListOpen ? 'Masquer la liste' : 'Afficher la liste'}
            </button>
            <Link className="header-link" to={withCountry('/places/new', activeCountry)}>
              Ajouter un POI
            </Link>
          </>
        )}
        <Link className="header-link" to="/admin/categories">Administration</Link>
        {isMapWorkspace ? (
          <div className="marker-count" aria-live="polite">
            <strong>{markerCount}</strong>
            <span>marqueur{markerCount > 1 ? 's' : ''}</span>
          </div>
        ) : (
          <Link className="header-link" to={withCountry('/', activeCountry)}>Carte</Link>
        )}
      </nav>
    </header>
  )
}
