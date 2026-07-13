import { includeActiveCountry } from '../../utils/country'

interface CountrySelectorProps {
  countries: string[]
  activeCountry: string | null
  isLoading: boolean
  errorMessage: string | null
  onChange: (country: string | null) => void
}

export function CountrySelector({
  countries,
  activeCountry,
  isLoading,
  errorMessage,
  onChange,
}: CountrySelectorProps) {
  const options = includeActiveCountry(countries, activeCountry)

  return (
    <label className="country-selector">
      <span>Pays</span>
      <select
        value={activeCountry ?? ''}
        disabled={isLoading}
        aria-describedby={errorMessage ? 'country-selector-error' : undefined}
        onChange={(event) => onChange(event.target.value || null)}
      >
        <option value="">Tous les pays</option>
        {options.map((country) => (
          <option key={country.toLocaleLowerCase('fr')} value={country}>
            {country}
          </option>
        ))}
      </select>
      {errorMessage && (
        <span className="country-selector-error" id="country-selector-error" role="alert">
          Pays indisponibles
        </span>
      )}
    </label>
  )
}
