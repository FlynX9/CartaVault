import { Map } from 'lucide-react'
import { useState } from 'react'

interface CountryFlagProps {
  countryCode: string
  className?: string
  fallbackSize?: number
}

export function CountryFlag({
  countryCode,
  className = '',
  fallbackSize = 30,
}: CountryFlagProps) {
  const [failed, setFailed] = useState(false)
  const normalizedCode = countryCode.trim().toLowerCase()

  if (failed || !/^[a-z]{2}$/.test(normalizedCode)) {
    return <Map className={`${className} country-flag-fallback`.trim()} size={fallbackSize} aria-hidden="true" />
  }

  return (
    <img
      className={className}
      src={`https://flagcdn.com/${normalizedCode}.svg`}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  )
}
