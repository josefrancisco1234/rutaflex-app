import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { ULIMA } from '../data/seed'
import { getPath } from '../lib/geo'
import { fetchRoute } from '../lib/route'
import type { LatLng, Trip } from '../types'

const carIcon = () => L.divIcon({ className: '', html: '<div class="carpin">🚗</div>', iconSize: [28, 28], iconAnchor: [14, 14] })
const destIcon = () => L.divIcon({ className: '', html: '<div class="destpin">🎓</div>', iconSize: [28, 28], iconAnchor: [14, 24] })
const originIcon = () => L.divIcon({ className: '', html: '<div class="destpin">📍</div>', iconSize: [28, 28], iconAnchor: [14, 26] })

function baseMap(el: HTMLElement) {
  const m = L.map(el, { scrollWheelZoom: false })
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 19, subdomains: 'abcd', attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  }).addTo(m)
  setTimeout(() => m.invalidateSize(), 60)
  return m
}

// Mapa de un viaje: ruta, paradas, partida, destino y auto en vivo.
export function TripMap({ t, small }: { t: Trip, small?: boolean }) {
  const el = useRef<HTMLDivElement>(null)
  const ref = useRef<{ map?: L.Map, line?: L.Polyline, car?: L.Marker | null }>({})
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
    ref.current = { map, line, car: null }
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
export function PickMap({ mode, onMode, onPick }: { mode: PickMode, onMode: (m: PickMode) => void, onPick: (kind: 'o' | 'd', p: LatLng) => void }) {
  const el = useRef<HTMLDivElement>(null)
  const modeRef = useRef(mode)
  modeRef.current = mode

  useEffect(() => {
    if (!el.current) return
    const map = baseMap(el.current)
    map.setView([-12.105, -77.0], 13)
    const destMarker = L.marker(ULIMA, { icon: destIcon() }).addTo(map).bindTooltip('Destino')
    let originMarker: L.Marker | null = null
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
