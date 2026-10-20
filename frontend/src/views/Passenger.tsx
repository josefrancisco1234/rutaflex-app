import { useState } from 'react'
import type { FormEvent } from 'react'
import { useSession } from '../context'
import { getDb, trip, user, save, active } from '../store/db'
import { norm, firstName } from '../lib/utils'
import { Empty, Heading, StatusPill, Price, Back } from '../components/ui'
import TripCard from '../components/TripCard'
import Profile from '../components/Profile'
import { TripMap } from '../components/maps'

// US05 · US17 · Buscar viajes
export function Home() {
  const { db, me, current, query, setQuery, searched, setSearched } = useSession()
  const [qErr, setQErr] = useState('')

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const q = String(new FormData(e.currentTarget).get('destination')).trim()
    if (!q) return setQErr('Ingresa un destino.')
    setQErr('')
    setQuery(q)
    setSearched(true)
  }

  const results = db.trips.filter(t => t.status === 'Activo' && t.seats > 0 && !t.members.includes(current) && (!searched || norm(t.dest).includes(norm(query))))
  return (
    <>
      <div className="hero">
        <div className="tag">Pasajero · Movilidad universitaria</div>
        <h1>Hola, {firstName(me.name)}.<br />Tu próximo viaje empieza aquí.</h1>
        <p className="muted">Busca un conductor que vaya a tu destino y reserva tu asiento.</p>
        <form className="search" onSubmit={submit}>
          <input aria-label="Destino" name="destination" placeholder="¿A dónde vas?" defaultValue={query} />
          <button>Buscar viajes →</button>
        </form>
        <div className="error">{qErr}</div>
      </div>
      <div className="top">
        <div>
          <div className="tag">US05 · US17</div>
          <h2>{searched ? 'Resultados de búsqueda' : 'Viajes disponibles'}</h2>
          <p className="muted">{searched ? 'Destino: ' + query : 'Listado general, sin recomendaciones ni filtros avanzados.'}</p>
        </div>
      </div>
      {results.length
        ? <div className="grid">{results.map(t => <TripCard key={t.id} t={t} />)}</div>
        : <Empty title="No se encontraron viajes disponibles" text="Prueba con otro destino." />}
    </>
  )
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
