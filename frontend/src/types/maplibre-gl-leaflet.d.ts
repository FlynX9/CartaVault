import type { Map as MapLibreMap, StyleSpecification } from 'maplibre-gl'

declare module 'leaflet' {
  interface MaplibreGLOptions {
    style: StyleSpecification | string
    interactive?: boolean
    attributionControl?: boolean
  }

  interface MaplibreGLLayer extends Layer {
    getMaplibreMap(): MapLibreMap
  }

  export function maplibreGL(options: MaplibreGLOptions): MaplibreGLLayer
}
