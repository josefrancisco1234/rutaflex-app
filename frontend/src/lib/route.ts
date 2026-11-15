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

export interface RouteInfo { path: LatLng[], km: number, mins: number }

// Ruta por calles entre varios puntos; null si OSRM no responde.
export async function osrmRoute(points: LatLng[], signal?: AbortSignal): Promise<RouteInfo | null> {
  const pts = points.map(p => p[1] + ',' + p[0]).join(';')
  try {
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${pts}?overview=full&geometries=geojson`, { signal })
    const j: OsrmResponse = await r.json()
    const route = j.routes?.[0]
    if (j.code !== 'Ok' || !route) return null
    return { path: route.geometry.coordinates.map(([lng, lat]): LatLng => [lat, lng]), km: route.distance / 1000, mins: Math.round(route.duration / 60) }
  } catch { return null }
}

export async function fetchRoute(t: Trip) {
  if (t.path || !t.o || tried.has(t.id)) return
  tried.add(t.id)
  const route = await osrmRoute([t.o, ...(t.w || []), t.d || ULIMA])
  if (!route) return
  const fresh = trip(t.id)
  if (!fresh || fresh.path) return
  fresh.path = route.path
  fresh.km = route.km
  fresh.mins = route.mins
  if (fresh.status === 'En curso' && !fresh.gps) fresh.pos = pointAt(fresh.path, fresh.progress || 0)
  save()
}
