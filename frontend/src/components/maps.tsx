import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { ULIMA } from '../data/seed'
import { getPath } from '../lib/geo'
import { fetchRoute } from '../lib/route'
import type { LatLng, Trip } from '../types'
import { user } from '../store/db'

const carIcon = () => L.divIcon({ className: '', html: '<div class="carpin">🚗</div>', iconSize: [28, 28], iconAnchor: [14, 14] })
const destIcon = () => L.divIcon({ className: '', html: '<div class="destpin">🎓</div>', iconSize: [28, 28], iconAnchor: [14, 24] })
const personIcon = (me: boolean) => L.divIcon({ className: '', html: '<div class="personpin' + (me ? ' me' : '') + '">🧍</div>', iconSize: [26, 26], iconAnchor: [13, 13] })
const originIcon = () => L.divIcon({ className: '', html: '<div class="destpin">📍</div>', iconSize: [28, 28], iconAnchor: [14, 26] })

function baseMap(el: HTMLElement) {
  const m = L.map(el, { scrollWheelZoom: false })
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 19, subdomains: 'abcd', attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  }).addTo(m)
  // Si el mapa se desmonta antes de 60 ms, no se recalcula (evita el error _leaflet_pos).
  const timer = setTimeout(() => m.invalidateSize(), 60)
  m.on('unload', () => clearTimeout(timer))
  return m
}

// Mapa de un viaje: ruta, paradas, partida, destino y auto en vivo.
export function TripMap({ t, small, me }: { t: Trip, small?: boolean, me?: string }) {
  const el = useRef<HTMLDivElement>(null)
  const ref = useRef<{ map?: L.Map, line?: L.Polyline, car?: L.Marker | null, people?: Map<string, L.Marker> }>({})
  const hasPath = Boolean(getPath(t))

  useEffect(() => {
    const p = getPath(t)
    if (!p || !el.current) return
    const map = baseMap(el.current)
    const line = L.polyline(p, { color: '#008b72', weight: 5, opacity: 0.85 }).addTo(map)
    L.marker(t.o ?? p[0], { icon: originIcon() }).addTo(map).bindTooltip('Partida: ' + t.origin)
    L.marker(t.d || ULIMA, { icon: destIcon() }).addTo(map).bindTooltip('Destino: ' + t.dest)
    ;(t.w || []).forEach((w, i) => L.circleMarker(w, { radius: 6, color: '#16354a', fillColor: '#fff', fillOpacity: 1, weight: 3 }).addTo(map).bindTooltip('Parada: ' + (t.stops?.[i] || '—')))
    map.fitBounds(line.getBounds(), { padding: [30, 30] })
    ref.current = { map, line, car: null, people: new Map() }
    fetchRoute(t)
    return () => { map.remove(); ref.current = {} }
  }, [t.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Actualiza ruta y auto en cada render (el viaje cambia en vivo).
  useEffect(() => {
    const { map, line } = ref.current
    if (!map) return
    const p = getPath(t)
    if (line && p && line.getLatLngs().length !== p.length) line.setLatLngs(p)
    if (t.status === 'En curso' && t.pos) {
      if (ref.current.car) ref.current.car.setLatLng(t.pos)
      else ref.current.car = L.marker(t.pos, { icon: carIcon(), zIndexOffset: 1000 }).addTo(map).bindTooltip('Conductor')
      if (!map.getBounds().contains(ref.current.car.getLatLng())) map.panTo(t.pos)
    } else if (ref.current.car) {
      ref.current.car.remove()
      ref.current.car = null
    }
    // US19 · Ubicaciones compartidas por los participantes.
    const people = ref.current.people!
    const shares = t.status === 'Activo' || t.status === 'En curso' ? t.shares || {} : {}
    people.forEach((mk, id) => { if (!shares[id]) { mk.remove(); people.delete(id) } })
    Object.entries(shares).forEach(([id, s]) => {
      const mk = people.get(id)
      if (mk) mk.setLatLng(s.p)
      else people.set(id, L.marker(s.p, { icon: personIcon(id === me), zIndexOffset: 900 }).addTo(map).bindTooltip(id === me ? 'Tú' : user(id)?.name || 'Participante'))
    })
  })

  if (!hasPath) {
    return (
      <div className={'leaf' + (small ? ' small' : '')}>
        <div className="mapfallback">Esta ruta no tiene coordenadas registradas.<br /><small>Las rutas antiguas sin mapa: POR DEFINIR.</small></div>
      </div>
    )
  }
  return <div ref={el} className={'leaf' + (small ? ' small' : '')} />
}

// Qué marca el próximo clic en el mapa de publicar ruta.
export type PickMode = 'origin' | 'dest'

// Mapa para publicar una ruta: clic para marcar la partida o mover el destino.
export function PickMap({ mode, onMode, onPick, origin, dest }: { mode: PickMode, onMode: (m: PickMode) => void, onPick: (kind: 'o' | 'd', p: LatLng) => void, origin?: LatLng | null, dest?: LatLng }) {
  const el = useRef<HTMLDivElement>(null)
  const modeRef = useRef(mode)
  modeRef.current = mode

  useEffect(() => {
    if (!el.current) return
    const map = baseMap(el.current)
    map.setView([-12.105, -77.0], 13)
    const destMarker = L.marker(dest || ULIMA, { icon: destIcon() }).addTo(map).bindTooltip('Destino')
    // US11 · Al editar, la partida ya viene marcada.
    let originMarker: L.Marker | null = origin ? L.marker(origin, { icon: originIcon() }).addTo(map).bindTooltip('Partida') : null
    if (origin) map.fitBounds(L.latLngBounds([origin, dest || ULIMA]), { padding: [40, 40] })
    map.on('click', e => {
      const p: LatLng = [+e.latlng.lat.toFixed(5), +e.latlng.lng.toFixed(5)]
      if (modeRef.current === 'origin') {
        if (originMarker) originMarker.setLatLng(p)
        else originMarker = L.marker(p, { icon: originIcon() }).addTo(map).bindTooltip('Partida')
        onPick('o', p)
        onMode('dest')
      } else {
        destMarker.setLatLng(p)
        onPick('d', p)
      }
    })
    return () => { map.remove() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} className="leaf small" />
}
