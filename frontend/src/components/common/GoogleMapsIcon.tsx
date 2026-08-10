interface GoogleMapsIconProps {
  className?: string
  size?: number
}

// Official Google Maps product icon, served by the Google Play listing.
const GOOGLE_MAPS_ICON_URL = 'https://play-lh.googleusercontent.com/B8pdO_2K5nBsF0g1h6dKwV_jQFLP-XombGDEQGtJT-mw1EUKCKJpa9lBGCF4rP_MwCsozSXyvI3z19g9R3J4'

export function GoogleMapsIcon({ className, size = 17 }: GoogleMapsIconProps) {
  return <img className={className ? `google-maps-icon ${className}` : 'google-maps-icon'} src={GOOGLE_MAPS_ICON_URL} width={size} height={size} alt="" aria-hidden="true" />
}
