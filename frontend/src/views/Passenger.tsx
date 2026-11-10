import { useState } from 'react'
import type { FormEvent } from 'react'
import { useSession } from '../context'
import { getDb, trip, user, save, active, notify } from '../store/db'
import { norm, firstName } from '../lib/utils'
import { Empty, Heading, StatusPill, Price, Back } from '../components/ui'
import TripCard from '../components/TripCard'
import Profile from '../components/Profile'
import { TripMap } from '../components/maps'
import { ZONES, recommend, toMin, usualTime, usualZone } from '../lib/zones'
import type { LatLng } from '../types'

// US05 · US07 · US08 · US17 · Buscar, filtrar y recomendar viajes
type Filters = { origin: string, from: string, to: string, maxPrice: string }
const NO_FILTERS: Filters = { origin: '', from: '', to: '', maxPrice: '' }

export function Home() {
  const { db, me, current, query, setQuery, searched, setSearched, toast } = useSession()
  const [qErr, setQErr] = useState('')
  const [fErr, setFErr] = useState('')
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [draft, setDraft] = useState<Filters>(NO_FILTERS)
  const [here, setHere] = useState<LatLng | null>(null)
  const [locating, setLocating] = useState(false)

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const q = String(new FormData(e.currentTarget).get('destination')).trim()
    if (!q) return setQErr('Ingresa un destino.')
    setQErr('')
    setQuery(q)
    setSearched(true)
  }

  // US07 · Valida y aplica los filtros.
  function applyFilters(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (draft.from && draft.to && toMin(draft.from) > toMin(draft.to)) return setFErr('La hora "desde" debe ser anterior a la hora "hasta".')
    if (draft.maxPrice !== '' && Number(draft.maxPrice) < 0) return setFErr('El precio máximo no puede ser negativo.')
    setFErr('')
    setFilters(draft)
  }
  function clearFilters() { setDraft(NO_FILTERS); setFilters(NO_FILTERS); setFErr(''); setQuery(''); setSearched(false) }

  function locate() {
    if (!navigator.geolocation) return toast('Tu navegador no permite geolocalización.')
    setLocating(true)
    navigator.geolocation.getCurrentPosition(p => { setHere([p.coords.latitude, p.coords.longitude]); setLocating(false); toast('Recomendaciones según tu ubicación actual.') },
      e => { setLocating(false); toast('No se pudo obtener tu ubicación: ' + e.message) }, { enableHighAccuracy: true, timeout: 10000 })
  }

  const available = db.trips.filter(t => t.status === 'Activo' && t.seats > 0 && !t.members.includes(current))
  const anyFilter = searched || Object.values(filters).some(Boolean)
  const results = available.filter(t =>
    (!searched || norm(t.dest).includes(norm(query))) &&
    (!filters.origin || norm(t.origin).includes(norm(filters.origin))) &&
    (!filters.from || toMin(t.time) >= toMin(filters.from)) &&
    (!filters.to || toMin(t.time) <= toMin(filters.to)) &&
    (filters.maxPrice === '' || (t.price != null && t.price <= Number(filters.maxPrice)))
  ).sort((a, b) => toMin(a.time) - toMin(b.time))

  // US08 · Recomendaciones según horario y ubicación del usuario.
  const past = db.trips.filter(t => t.status === 'Finalizado' && t.members.includes(current))
  const zone = usualZone(me, past)
  const time = usualTime(me, past)
  const at = here ?? (zone ? ZONES[zone] : null)
  const recs = recommend(available, at, time)

  return (
    <>
      <div className="hero">
        <div className="tag">Pasajero · Movilidad universitaria</div>
        <h1>Hola, {firstName(me.name)}.<br />Tu próximo viaje empieza aquí.</h1>
        <p className="muted">Busca un conductor que vaya a tu destino y reserva tu asiento.</p>
        <form className="search" onSubmit={submit}>
          <input aria-label="Destino" name="destination" placeholder="¿A dónde vas?" defaultValue={query} key={query} />
          <button>Buscar viajes →</button>
        </form>
        <div className="error">{qErr}</div>
      </div>

      <section className="card recs" aria-labelledby="recs-title">
        <div className="row between">
          <div>
            <div className="tag">US08 · Recomendados para ti</div>
            <h2 id="recs-title">Viajes que encajan con tu rutina</h2>
            <p className="muted">
              {here ? 'Según tu ubicación actual' : zone ? 'Según tu zona: ' + zone : 'Sin zona registrada'}
              {' · '}{time ? 'hora habitual ' + time : 'sin hora habitual'}
            </p>
          </div>
          <button className="secondary" onClick={locate} disabled={locating}>{locating ? 'Ubicando…' : '📍 Usar mi ubicación'}</button>
        </div>
        {!at && !time
          ? <p className="muted">Completa tu zona y hora habitual en <strong>Perfil → Editar perfil</strong> para recibir recomendaciones.</p>
          : recs.length
            ? <div className="reclist">{recs.map(r => (
              <div key={r.t.id} className="rec">
                <div>
                  <strong>{r.t.origin}</strong> → {r.t.dest}<br />
                  <small>{r.t.time} · {user(r.t.driver)?.name}{user(r.t.driver)?.verified ? ' ✔' : ''} · {r.t.seats} asiento(s)</small>
                  <div className="why">
                    {r.km != null && <span>📍 a {r.km.toFixed(1).replace('.', ',')} km</span>}
                    {r.diff != null && <span>🕒 {r.diff === 0 ? 'a tu hora habitual' : r.diff + ' min de diferencia'}</span>}
                    <span>{Math.round(r.score * 100)}% de coincidencia</span>
                  </div>
                </div>
                <TripLink id={r.t.id} />
              </div>
            ))}</div>
            : <p className="muted">No hay viajes disponibles cerca de tu ubicación ni de tu horario habitual.</p>}
      </section>

      <form className="card filters" onSubmit={applyFilters} noValidate aria-label="Filtros de búsqueda">
        <div className="tag">US07 · Filtrar viajes</div>
        <div className="fgrid">
          <div className="field"><label htmlFor="f-origin">Partida o distrito</label><input id="f-origin" value={draft.origin} onChange={e => setDraft({ ...draft, origin: e.target.value })} placeholder="Ej. Miraflores" /></div>
          <div className="field"><label htmlFor="f-from">Hora desde</label><input id="f-from" type="time" value={draft.from} onChange={e => setDraft({ ...draft, from: e.target.value })} /></div>
          <div className="field"><label htmlFor="f-to">Hora hasta</label><input id="f-to" type="time" value={draft.to} onChange={e => setDraft({ ...draft, to: e.target.value })} /></div>
          <div className="field"><label htmlFor="f-price">Precio máx. (S/)</label><input id="f-price" type="number" min="0" step="0.5" value={draft.maxPrice} onChange={e => setDraft({ ...draft, maxPrice: e.target.value })} /></div>
        </div>
        <div className="error">{fErr}</div>
        <div className="row">
          <button>Aplicar filtros</button>
          <button type="button" className="secondary" onClick={clearFilters} disabled={!anyFilter && !Object.values(draft).some(Boolean)}>Limpiar</button>
        </div>
      </form>

      <div className="top">
        <div>
          <div className="tag">US05 · US07 · US17</div>
          <h2>{anyFilter ? 'Resultados filtrados' : 'Viajes disponibles'}</h2>
          <p className="muted">{describe(searched ? query : '', filters) || 'Todos los viajes con asientos libres, ordenados por hora.'}</p>
        </div>
      </div>
      {results.length
        ? <div className="grid">{results.map(t => <TripCard key={t.id} t={t} />)}</div>
        : <Empty title="No se encontraron viajes disponibles" text={anyFilter ? 'Ningún viaje coincide con los filtros. Ajusta la hora, el destino o el precio.' : 'Prueba con otro destino.'} />}
    </>
  )
}

function describe(dest: string, f: Filters) {
  const parts: string[] = []
  if (dest) parts.push('Destino: ' + dest)
  if (f.origin) parts.push('Partida: ' + f.origin)
  if (f.from || f.to) parts.push('Hora: ' + (f.from || '00:00') + '–' + (f.to || '23:59'))
  if (f.maxPrice !== '') parts.push('Hasta S/ ' + Number(f.maxPrice).toFixed(2))
  return parts.join(' · ')
}

function TripLink({ id }: { id: string }) {
  const { go } = useSession()
  return <button className="secondary" onClick={() => go('detail', id)}>Ver viaje →</button>
}

export function MyTrips() {
  const { db, current } = useSession()
  const ts = db.trips.filter(t => active(t) && t.members.includes(current) && t.driver !== current)
  return (
    <>
      <Heading title="Mis viajes" hu="Pasajero" sub="Viajes reservados y en curso. Síguelos en el mapa." />
      {ts.length
        ? <div className="grid">{ts.map(t => <TripCard key={t.id} t={t} />)}</div>
        : <Empty title="No tienes viajes reservados" text="Busca un viaje y reserva un asiento." />}
    </>
  )
}

// US06 · Detalle del viaje + reserva
export function Detail() {
  const { current, selected, go, toast } = useSession()
  const t = trip(selected)
  const u = t && user(t.driver)
  if (!t || !u || t.status !== 'Activo' || (t.seats < 1 && !t.members.includes(current))) {
    return <>
      <Back go={go} to="home" label="← Volver a búsqueda" />
      <Heading title="Viaje no disponible" hu="US06" />
      <Empty title="Este viaje no puede consultarse" text="La ruta no está disponible o no tiene asientos." />
    </>
  }
  const member = t.members.includes(current)
  const canChat = active(t) && member

  function reserve() {
    const t = trip(selected)
    if (!t || t.status !== 'Activo' || t.seats < 1) return toast('Este viaje ya no tiene asientos.')
    if (t.members.includes(current)) return go('trip', t.id)
    t.seats--
    t.members.push(current)
    getDb().messages[t.id] ??= []
    notify([t.driver], 'viaje', (user(current)?.name || 'Un pasajero') + ' reservó un asiento en tu viaje ' + t.origin + ' → ' + t.dest + ' (' + t.time + ').', t.id)
    save()
    toast('Asiento reservado. Ya puedes seguir el viaje.')
    go('trip', t.id)
  }

  return (
    <>
      <Back go={go} to="home" label="← Volver a búsqueda" />
      <Heading title="Detalles del viaje" hu="US06 · US17" sub={t.origin + ' → ' + t.dest} />
      <div className="split">
        <div className="card">
          <div className="row between"><StatusPill t={t} /><Price t={t} suffix=" / asiento" empty="Precio: POR DEFINIR" /></div>
          <TripMap t={t} small />
          <div className="grid">
            <div><small>SALIDA</small><h3>{t.time}</h3></div>
            <div><small>DISPONIBILIDAD</small><h3>{t.seats} asientos</h3></div>
            <div><small>VEHÍCULO</small><p>{u.car || 'POR DEFINIR'}</p></div>
            <div><small>PARADAS</small><p>{t.stops?.length ? t.stops.join(' · ') : 'POR DEFINIR'}</p></div>
            {t.editedAt && <div><small>ÚLTIMA EDICIÓN</small><p>{t.editedAt}</p></div>}
          </div>
          {member
            ? <button className="full" onClick={() => go('trip', t.id)}>Seguir mi viaje en el mapa</button>
            : <button className="full" onClick={reserve}>Reservar asiento</button>}
          <button className="secondary full" style={{ marginTop: 10 }} onClick={() => go('chat', t.id)}>{canChat ? 'Abrir chat del viaje' : 'Consultar acceso al chat'}</button>
        </div>
        <div><Profile u={u} /></div>
      </div>
    </>
  )
}
