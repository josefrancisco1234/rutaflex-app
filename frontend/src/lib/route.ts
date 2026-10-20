import { ULIMA } from '../data/seed'
import { trip, save } from '../store/db'
import { pointAt } from './geo'
import type { LatLng, Trip } from '../types'

// Respuesta de OSRM (solo los campos que se usan). Las coordenadas vienen como [lng, lat].
interface OsrmResponse {
  code: string
  routes?: { geometry: { coordinates: [number, number][] }, distance: number, duration: number }[]
}

// Pide a OSRM la ruta por calles; si no responde, el mapa usa la línea por paradas.
const tried = new Set<string>()
export const clearRouteTried = () => tried.clear()

export async function fetchRoute(t: Trip) {
  if (t.path || !t.o || tried.has(t.id)) return
  tried.add(t.id)
  const pts = [t.o, ...(t.w || []), t.d || ULIMA].map(p => p[1] + ',' + p[0]).join(';')
  try {
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${pts}?overview=full&geometries=geojson`)
    const j: OsrmResponse = await r.json()
    const route = j.routes?.[0]
    if (j.code !== 'Ok' || !route) return
    const fresh = trip(t.id)
    if (!fresh || fresh.path) return
    fresh.path = route.geometry.coordinates.map(([lng, lat]): LatLng => [lat, lng])
    fresh.km = route.distance / 1000
    fresh.mins = Math.round(route.duration / 60)
    if (fresh.status === 'En curso' && !fresh.gps) fresh.pos = pointAt(fresh.path, fresh.progress || 0)
    save()
  } catch {}
}
