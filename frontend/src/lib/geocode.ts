import type { LatLng } from '../types'

// Búsqueda de direcciones con Photon (geocodificador gratuito basado en OpenStreetMap, sin API key).
// https://photon.komoot.io · Los resultados se priorizan cerca de Lima.
const PHOTON = 'https://photon.komoot.io'
const LIMA: LatLng = [-12.08, -77.02]
// Lima Metropolitana y Callao (oeste, sur, este, norte).
const BBOX = '-77.25,-12.35,-76.70,-11.75'

export interface Place { label: string, detail: string, p: LatLng }

interface PhotonFeature {
  geometry: { coordinates: [number, number] }
  properties: { name?: string, street?: string, housenumber?: string, district?: string, locality?: string, city?: string, county?: string, state?: string }
}

// preferStreet: al marcar un punto se muestra "calle número" en vez del negocio más cercano.
function toPlace(f: PhotonFeature, preferStreet = false): Place {
  const pr = f.properties
  const street = [pr.street, pr.housenumber].filter(Boolean).join(' ')
  const label = (preferStreet && street) || pr.name || street || pr.district || pr.city || 'Punto en el mapa'
  const area = [...new Set([pr.district || pr.locality, pr.city || pr.county])].filter(Boolean)
  const detail = [label !== street ? street : '', ...area].filter(Boolean).join(', ')
  const [lng, lat] = f.geometry.coordinates
  return { label, detail, p: [+lat.toFixed(5), +lng.toFixed(5)] }
}

// Texto corto para el campo del formulario: "Parque Kennedy, Miraflores".
export const placeText = (pl: Place) => {
  const district = pl.detail.split(', ').find(x => x && !/^Lima$/i.test(x) && x !== pl.label && !/\d/.test(x))
  return district ? pl.label + ', ' + district : pl.label
}

export async function searchPlaces(q: string, signal?: AbortSignal): Promise<Place[]> {
  const url = `${PHOTON}/api/?q=${encodeURIComponent(q)}&lat=${LIMA[0]}&lon=${LIMA[1]}&bbox=${BBOX}&limit=6`
  const r = await fetch(url, { signal })
  if (!r.ok) throw new Error('búsqueda ' + r.status)
  const j: { features: PhotonFeature[] } = await r.json()
  // Sin duplicados (la misma calle aparece por tramos).
  const seen = new Set<string>()
  return j.features.map(f => toPlace(f)).filter(pl => { const k = pl.label + '|' + pl.detail; if (seen.has(k)) return false; seen.add(k); return true })
}

// Dirección aproximada de un punto (al hacer clic o arrastrar un pin).
export async function reversePlace(p: LatLng): Promise<Place | null> {
  try {
    const r = await fetch(`${PHOTON}/reverse?lat=${p[0]}&lon=${p[1]}&limit=1`)
    if (!r.ok) return null
    const j: { features: PhotonFeature[] } = await r.json()
    return j.features[0] ? { ...toPlace(j.features[0], true), p } : null
  } catch { return null }
}

// Enlace para abrir el recorrido en Google Maps (navegación real en el celular).
export function googleMapsUrl(o: LatLng, d: LatLng, w: LatLng[] = []) {
  const s = (p: LatLng) => p[0] + ',' + p[1]
  return 'https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=' + s(o) + '&destination=' + s(d)
    + (w.length ? '&waypoints=' + encodeURIComponent(w.map(s).join('|')) : '')
}
