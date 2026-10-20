import { ULIMA } from '../data/seed'
import { trip, save } from '../store/db'
import { pointAt } from './geo'

// Pide a OSRM la ruta por calles; si no responde, el mapa usa la línea por paradas.
const tried = new Set()
export const clearRouteTried = () => tried.clear()

export async function fetchRoute(t) {
  if (t.path || !t.o || tried.has(t.id)) return
  tried.add(t.id)
  const pts = [t.o, ...(t.w || []), t.d || ULIMA].map(p => p[1] + ',' + p[0]).join(';')
  try {
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${pts}?overview=full&geometries=geojson`)
    const j = await r.json()
    if (j.code !== 'Ok' || !j.routes?.[0]) return
    const fresh = trip(t.id)
    if (!fresh || fresh.path) return
    fresh.path = j.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng])
    fresh.km = j.routes[0].distance / 1000
    fresh.mins = Math.round(j.routes[0].duration / 60)
    if (fresh.status === 'En curso' && !fresh.gps) fresh.pos = pointAt(fresh.path, fresh.progress || 0)
    save()
  } catch {}
}
