import { ULIMA } from '../data/seed'

// Distancia en metros entre dos puntos [lat, lng] (fórmula de haversine).
export function hav(a, b) {
  const R = 6371000, r = x => x * Math.PI / 180, dl = r(b[0] - a[0]), dn = r(b[1] - a[1])
  const h = Math.sin(dl / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dn / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function getPath(t) {
  if (t.path && t.path.length > 1) return t.path
  if (!t.o) return null
  return [t.o, ...(t.w || []), t.d || ULIMA]
}

export function pathLen(p) {
  let s = 0
  for (let i = 1; i < p.length; i++) s += hav(p[i - 1], p[i])
  return s
}

export function pointAt(p, f) {
  const total = pathLen(p)
  let goal = total * Math.min(1, Math.max(0, f))
  for (let i = 1; i < p.length; i++) {
    const seg = hav(p[i - 1], p[i])
    if (goal <= seg || i === p.length - 1) {
      const k = seg ? Math.min(1, goal / seg) : 1
      return [p[i - 1][0] + (p[i][0] - p[i - 1][0]) * k, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * k]
    }
    goal -= seg
  }
  return p[p.length - 1]
}

export const km = m => (m / 1000).toFixed(1) + ' km'

export function liveNumbers(t) {
  const p = getPath(t)
  if (!p) return { rem: 0, pct: 0 }
  const total = pathLen(p)
  if (t.status === 'Finalizado') return { rem: 0, pct: 100, total }
  if (t.status !== 'En curso') return { rem: total, pct: 0, total }
  let rem, pct
  if (t.gps && t.pos) {
    rem = hav(t.pos, t.d || ULIMA)
    pct = Math.max(0, Math.min(100, 100 * (1 - rem / hav(t.o, t.d || ULIMA))))
  } else {
    rem = total * (1 - (t.progress || 0))
    pct = 100 * (t.progress || 0)
  }
  return { rem, pct, total }
}
