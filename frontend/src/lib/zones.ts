import type { LatLng, Trip, User } from '../types'
import { hav } from './geo'
import { norm } from './utils'

// Centro aproximado de distritos de Lima usados por la comunidad universitaria (datos de referencia).
export const ZONES: Record<string, LatLng> = {
  'Ate': [-12.0255, -76.9205],
  'Barranco': [-12.1493, -77.0213],
  'Chorrillos': [-12.1689, -77.0153],
  'Jesús María': [-12.0763, -77.0493],
  'La Molina': [-12.0745, -76.9505],
  'Lince': [-12.0829, -77.0352],
  'Magdalena del Mar': [-12.0911, -77.0712],
  'Miraflores': [-12.1219, -77.0298],
  'Pueblo Libre': [-12.0745, -77.0634],
  'San Borja': [-12.0985, -76.9985],
  'San Isidro': [-12.0960, -77.0345],
  'San Miguel': [-12.0773, -77.0911],
  'Santiago de Surco': [-12.1305, -76.9985],
  'Surquillo': [-12.1129, -77.0115],
}
export const ZONE_NAMES = Object.keys(ZONES)

export const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + (m || 0) }
export const fromMin = (n: number) => String(Math.floor(n / 60) % 24).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0')

// Hora habitual del usuario: la del perfil o, si no tiene, el promedio de su historial.
export function usualTime(u: User, history: Trip[]) {
  if (u.prefTime) return u.prefTime
  const ts = history.filter(t => t.time).map(t => toMin(t.time))
  return ts.length ? fromMin(Math.round(ts.reduce((a, b) => a + b, 0) / ts.length)) : null
}

// Zona del usuario: la del perfil o la partida más frecuente de su historial.
export function usualZone(u: User, history: Trip[]) {
  if (u.zone && ZONES[u.zone]) return u.zone
  const count: Record<string, number> = {}
  history.forEach(t => { const z = ZONE_NAMES.find(z => norm(t.origin).includes(norm(z.split(' ').pop() || z))); if (z) count[z] = (count[z] || 0) + 1 })
  return Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

export interface Recommendation { t: Trip, score: number, km: number | null, diff: number | null }

// US08 · Puntaje 0–1: 60 % cercanía de la partida a la ubicación del usuario, 40 % cercanía a su hora habitual.
// Solo se recomiendan viajes con al menos 30 % de coincidencia y a menos de 5 km o con 60 minutos de diferencia como máximo.
export function recommend(trips: Trip[], at: LatLng | null, time: string | null, max = 3): Recommendation[] {
  if (!at && !time) return []
  return trips.map(t => {
    const km = at && t.o ? hav(at, t.o) / 1000 : null
    const diff = time ? Math.abs(toMin(t.time) - toMin(time)) : null
    const near = km == null ? 0 : 1 / (1 + km / 2)
    const close = diff == null ? 0 : 1 / (1 + diff / 30)
    const score = (at ? 0.6 : 0) * near + (time ? 0.4 : 0) * close + (!at ? 0.6 * close : 0) + (!time ? 0.4 * near : 0)
    return { t, score, km, diff }
  })
    .filter(r => r.score >= 0.3 && ((r.km != null && r.km <= 5) || (r.diff != null && r.diff <= 60)))
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
}
