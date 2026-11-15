import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import L from 'leaflet'
import { ULIMA } from '../data/seed'
import { getPath } from '../lib/geo'
import { fetchRoute, osrmRoute } from '../lib/route'
import { searchPlaces, reversePlace, placeText, googleMapsUrl } from '../lib/geocode'
import type { Place } from '../lib/geocode'
import type { LatLng, Trip } from '../types'
import { user } from '../store/db'

// ---------- Marcadores con estilo de pin ----------
const pinSvg = (color: string) =>
  `<svg viewBox="0 0 30 42" width="30" height="42" aria-hidden="true"><path d="M15 1C7.3 1 1 7.2 1 14.9 1 25.4 15 41 15 41s14-15.6 14-26.1C29 7.2 22.7 1 15 1z" fill="${color}" stroke="#fff" stroke-width="2"/><circle cx="15" cy="15" r="5.5" fill="#fff"/></svg>`
const pin = (color: string) => L.divIcon({ className: 'gpin', html: pinSvg(color), iconSize: [30, 42], iconAnchor: [15, 41], tooltipAnchor: [0, -36] })
const originIcon = () => pin('#0f9d58')
const destIcon = () => pin('#ea4335')
const carIcon = () => L.divIcon({ className: '', html: '<div class="carpin">🚗</div>', iconSize: [34, 34], iconAnchor: [17, 17] })
const personIcon = (me: boolean) => L.divIcon({ className: '', html: '<div class="personpin' + (me ? ' me' : '') + '">🧍</div>', iconSize: [26, 26], iconAnchor: [13, 13] })
const meIcon = () => L.divIcon({ className: '', html: '<div class="medot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] })
const stopStyle: L.CircleMarkerOptions = { radius: 6, color: '#3c4043', fillColor: '#fff', fillOpacity: 1, weight: 3 }

// Ruta con borde, como en las apps de navegación.
function routeLine(map: L.Map, p: LatLng[]) {
  const casing = L.polyline(p, { color: '#0b57d0', weight: 9, opacity: 0.9 }).addTo(map)
  const line = L.polyline(p, { color: '#4f8ff7', weight: 5, opacity: 1 }).addTo(map)
  return {
    line,
    set: (q: LatLng[]) => { casing.setLatLngs(q); line.setLatLngs(q) },
    remove: () => { casing.remove(); line.remove() },
  }
}

// ---------- Mapa base: calles / satélite, zoom, escala y "mi ubicación" ----------
function baseMap(el: HTMLElement, onLocate: (p: LatLng | null, err?: string) => void) {
  const m = L.map(el, { zoomControl: false, scrollWheelZoom: true, wheelPxPerZoomLevel: 90 })
  // Calles: Esri World Street Map (sin API key). CARTO ahora exige key y muestra "API KEY REQUIRED".
  const streets = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19, attribution: 'Mapa &copy; Esri, HERE, Garmin, &copy; OpenStreetMap',
  }).addTo(m)
  const satellite = L.layerGroup([
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imágenes &copy; Esri' }),
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, opacity: 0.8 }),
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }),
  ])
  L.control.zoom({ position: 'bottomright', zoomInTitle: 'Acercar', zoomOutTitle: 'Alejar' }).addTo(m)
  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(m)

  // Botón Mapa / Satélite.
  const LayerToggle = L.Control.extend({
    onAdd() {
      const b = L.DomUtil.create('button', 'maptoggle') as HTMLButtonElement
      b.type = 'button'
      let sat = false
      const paint = () => { b.textContent = sat ? '🗺️ Mapa' : '🛰️ Satélite'; b.title = sat ? 'Ver mapa de calles' : 'Ver imagen satelital' }
      paint()
      L.DomEvent.disableClickPropagation(b)
      b.onclick = () => {
        sat = !sat
        if (sat) { streets.remove(); satellite.addTo(m) } else { satellite.remove(); streets.addTo(m) }
        paint()
      }
      return b
    },
  })
  new LayerToggle({ position: 'bottomleft' }).addTo(m)

  // Botón "mi ubicación" (GPS del navegador).
  let meMarker: L.Marker | null = null, meCircle: L.Circle | null = null
  const Locate = L.Control.extend({
    onAdd() {
      const b = L.DomUtil.create('button', 'maplocate') as HTMLButtonElement
      b.type = 'button'
      b.title = 'Mi ubicación'
      b.setAttribute('aria-label', 'Mi ubicación')
      b.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8.94 3A9 9 0 0 0 13 3.06V1h-2v2.06A9 9 0 0 0 3.06 11H1v2h2.06A9 9 0 0 0 11 20.94V23h2v-2.06A9 9 0 0 0 20.94 13H23v-2h-2.06zM12 19a7 7 0 1 1 0-14 7 7 0 0 1 0 14z"/></svg>'
      L.DomEvent.disableClickPropagation(b)
      b.onclick = () => {
        if (!('geolocation' in navigator)) return onLocate(null, 'Tu navegador no permite obtener la ubicación.')
        b.classList.add('busy')
        navigator.geolocation.getCurrentPosition(pos => {
          b.classList.remove('busy')
          const p: LatLng = [+pos.coords.latitude.toFixed(5), +pos.coords.longitude.toFixed(5)]
          meCircle?.remove()
          meCircle = L.circle(p, { radius: Math.min(pos.coords.accuracy, 500), color: '#1a73e8', weight: 1, fillOpacity: 0.12 }).addTo(m)
          if (meMarker) meMarker.setLatLng(p)
          else meMarker = L.marker(p, { icon: meIcon(), zIndexOffset: 800, interactive: false }).addTo(m)
          m.flyTo(p, Math.max(m.getZoom(), 16), { duration: 0.8 })
          onLocate(p)
        }, err => {
          b.classList.remove('busy')
          onLocate(null, err.code === err.PERMISSION_DENIED ? 'Permiso de ubicación denegado. Actívalo en el navegador.' : 'No se pudo obtener tu ubicación.')
        }, { enableHighAccuracy: true, timeout: 10000 })
      }
      return b
    },
  })
  new Locate({ position: 'bottomright' }).addTo(m)

  // Si el mapa se desmonta antes de 60 ms, no se recalcula (evita el error _leaflet_pos).
  const timer = setTimeout(() => m.invalidateSize(), 60)
  m.on('unload', () => clearTimeout(timer))
  return m
}

// Aviso breve sobre el mapa (errores de ubicación, búsqueda, etc.).
function useMapMsg() {
  const [msg, setMsg] = useState('')
  const t = useRef<ReturnType<typeof setTimeout>>()
  const show = (s: string) => { setMsg(s); clearTimeout(t.current); t.current = setTimeout(() => setMsg(''), 4000) }
  useEffect(() => () => clearTimeout(t.current), [])
  return { msg, show }
}

const fmtKm = (km: number) => km < 1 ? Math.round(km * 1000) + ' m' : km.toFixed(1) + ' km'
const fmtMin = (m: number) => m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min'

// ---------- Mapa de un viaje: ruta, paradas, partida, destino y auto en vivo ----------
export function TripMap({ t, small, me }: { t: Trip, small?: boolean, me?: string }) {
  const el = useRef<HTMLDivElement>(null)
  const ref = useRef<{ map?: L.Map, route?: ReturnType<typeof routeLine>, car?: L.Marker | null, people?: Map<string, L.Marker> }>({})
  const hasPath = Boolean(getPath(t))
  const { msg, show } = useMapMsg()

  useEffect(() => {
    const p = getPath(t)
    if (!p || !el.current) return
    const map = baseMap(el.current, (_p, err) => { if (err) show(err) })
    const route = routeLine(map, p)
    L.marker(t.o ?? p[0], { icon: originIcon() }).addTo(map).bindTooltip('Partida: ' + t.origin)
    L.marker(t.d || ULIMA, { icon: destIcon() }).addTo(map).bindTooltip('Destino: ' + t.dest)
    ;(t.w || []).forEach((w, i) => L.circleMarker(w, stopStyle).addTo(map).bindTooltip('Parada: ' + (t.stops?.[i] || '—')))
    map.fitBounds(route.line.getBounds(), { padding: [40, 40] })
    ref.current = { map, route, car: null, people: new Map() }
    fetchRoute(t)
    return () => { map.remove(); ref.current = {} }
  }, [t.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Actualiza ruta y auto en cada render (el viaje cambia en vivo).
  useEffect(() => {
    const { map, route } = ref.current
    if (!map) return
    const p = getPath(t)
    if (route && p && route.line.getLatLngs().length !== p.length) route.set(p)
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
  const o = t.o ?? getPath(t)![0]
  return (
    <>
      <div className="mapwrap">
        <div ref={el} className={'leaf' + (small ? ' small' : '')} />
        {t.km != null && <div className="routechip"><strong>{t.mins != null ? fmtMin(t.mins) : ''}</strong> <span>{fmtKm(t.km)}</span></div>}
        {msg && <div className="mapmsg" role="status">{msg}</div>}
      </div>
      <a className="gmaps" href={googleMapsUrl(o, t.d || ULIMA, t.w)} target="_blank" rel="noopener noreferrer">↗ Abrir en Google Maps para navegar</a>
    </>
  )
}

// ---------- Buscador de direcciones con autocompletado ----------
function MapSearch({ placeholder, onSelect }: { placeholder: string, onSelect: (pl: Place) => void }) {
  const [q, setQ] = useState('')
  const [list, setList] = useState<Place[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [active, setActive] = useState(-1)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const text = q.trim()
    if (text.length < 3) { setList([]); setFailed(false); return }
    const ctrl = new AbortController()
    const timer = setTimeout(async () => {
      setBusy(true)
      try { setList(await searchPlaces(text, ctrl.signal)); setFailed(false); setActive(-1) }
      catch (e) { if ((e as Error).name !== 'AbortError') { setList([]); setFailed(true) } }
      finally { setBusy(false) }
    }, 350)
    return () => { clearTimeout(timer); ctrl.abort() }
  }, [q])

  function pick(pl: Place) {
    setQ(placeText(pl))
    setOpen(false)
    onSelect(pl)
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); const pl = list[Math.max(active, 0)]; if (pl) pick(pl) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => Math.min(a + 1, list.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) }
  }

  const show = open && q.trim().length >= 3
  return (
    <div className="mapsearch" onClick={e => e.stopPropagation()}>
      <div className="searchbar">
        <span aria-hidden="true">🔍</span>
        <input value={q} placeholder={placeholder} aria-label={placeholder} role="combobox" aria-expanded={show} aria-autocomplete="list"
          onChange={e => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onKeyDown={onKey} />
        {q && <button type="button" className="clear" aria-label="Borrar búsqueda" onClick={() => { setQ(''); setList([]) }}>✕</button>}
      </div>
      {show && (
        <ul className="suggestions" role="listbox">
          {busy && !list.length && <li className="hint">Buscando…</li>}
          {!busy && failed && <li className="hint">No se pudo buscar. Revisa tu conexión o marca el punto en el mapa.</li>}
          {!busy && !failed && !list.length && <li className="hint">Sin resultados en Lima. Prueba con otra dirección.</li>}
          {list.map((pl, i) => (
            <li key={pl.label + pl.detail + i} role="option" aria-selected={i === active} className={i === active ? 'active' : ''}
              onMouseDown={e => { e.preventDefault(); pick(pl) }}>
              <span className="sicon">📍</span>
              <span><strong>{pl.label}</strong><small>{pl.detail}</small></span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Qué marca el próximo clic en el mapa de publicar ruta.
export type PickMode = 'origin' | 'dest'

// ---------- Mapa para publicar una ruta ----------
// Busca una dirección, haz clic o arrastra los pines. Al elegir un punto se completa la dirección del formulario
// y se muestra la ruta por calles con su distancia y tiempo estimados.
export function PickMap({ mode, onMode, onPick, onAddress, origin, dest }: {
  mode: PickMode, onMode: (m: PickMode) => void, onPick: (kind: 'o' | 'd', p: LatLng) => void,
  onAddress?: (kind: 'o' | 'd', text: string) => void, origin?: LatLng | null, dest?: LatLng
}) {
  const el = useRef<HTMLDivElement>(null)
  const modeRef = useRef(mode)
  modeRef.current = mode
  const api = useRef<{ set?: (kind: 'o' | 'd', p: LatLng, text?: string, silent?: boolean) => void }>({})
  const [pts, setPts] = useState<{ o: LatLng | null, d: LatLng }>({ o: origin ?? null, d: dest || ULIMA })
  const [info, setInfo] = useState<{ km: number, mins: number } | null>(null)
  const { msg, show } = useMapMsg()
  const mapRef = useRef<L.Map>()
  const lineRef = useRef<ReturnType<typeof routeLine> | null>(null)

  useEffect(() => {
    if (!el.current) return
    const map = baseMap(el.current, (p, err) => {
      if (err) return show(err)
      if (p && modeRef.current === 'origin') set('o', p)
    })
    mapRef.current = map
    map.setView([-12.105, -77.0], 13)
    const destMarker = L.marker(dest || ULIMA, { icon: destIcon(), draggable: true, autoPan: true }).addTo(map).bindTooltip('Destino')
    // US11 · Al editar, la partida ya viene marcada.
    let originMarker: L.Marker | null = null
    if (origin) map.fitBounds(L.latLngBounds([origin, dest || ULIMA]), { padding: [50, 50] })

    function set(kind: 'o' | 'd', p: LatLng, text?: string, silent = false) {
      if (kind === 'o') {
        if (originMarker) originMarker.setLatLng(p)
        else {
          originMarker = L.marker(p, { icon: originIcon(), draggable: true, autoPan: true }).addTo(map).bindTooltip('Partida')
          originMarker.on('dragend', () => { const ll = originMarker!.getLatLng(); set('o', [+ll.lat.toFixed(5), +ll.lng.toFixed(5)]) })
        }
        setPts(s => ({ ...s, o: p }))
        onPick('o', p)
        onMode('dest')
      } else {
        destMarker.setLatLng(p)
        setPts(s => ({ ...s, d: p }))
        onPick('d', p)
      }
      if (silent) return
      if (text) onAddress?.(kind, text)
      else if (onAddress) reversePlace(p).then(pl => { if (pl) onAddress(kind, placeText(pl)) })
    }
    api.current.set = set
    if (origin) set('o', origin, undefined, true)   // marca sin reescribir la dirección guardada
    destMarker.on('dragend', () => { const ll = destMarker.getLatLng(); set('d', [+ll.lat.toFixed(5), +ll.lng.toFixed(5)]) })
    map.on('click', e => set(modeRef.current === 'origin' ? 'o' : 'd', [+e.latlng.lat.toFixed(5), +e.latlng.lng.toFixed(5)]))
    return () => { map.remove(); mapRef.current = undefined; lineRef.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Vista previa de la ruta por calles.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !pts.o) { setInfo(null); return }
    const ctrl = new AbortController()
    osrmRoute([pts.o, pts.d], ctrl.signal).then(r => {
      if (ctrl.signal.aborted || !mapRef.current) return
      if (!r) { setInfo(null); lineRef.current?.remove(); lineRef.current = null; return }
      if (lineRef.current) lineRef.current.set(r.path)
      else lineRef.current = routeLine(map, r.path)
      setInfo({ km: r.km, mins: r.mins })
      map.fitBounds(lineRef.current.line.getBounds(), { padding: [50, 50], maxZoom: 16 })
    })
    return () => ctrl.abort()
  }, [pts])

  function onSearch(pl: Place) {
    const kind = modeRef.current === 'origin' ? 'o' : 'd'
    api.current.set?.(kind, pl.p, placeText(pl))
    mapRef.current?.flyTo(pl.p, 16, { duration: 0.8 })
  }

  return (
    <div className="mapwrap">
      <div ref={el} className="leaf" />
      <MapSearch key={mode} placeholder={mode === 'origin' ? 'Busca el punto de partida' : 'Busca el destino'} onSelect={onSearch} />
      {info && <div className="routechip"><strong>{fmtMin(info.mins)}</strong> <span>{fmtKm(info.km)}</span></div>}
      {msg && <div className="mapmsg" role="status">{msg}</div>}
    </div>
  )
}
