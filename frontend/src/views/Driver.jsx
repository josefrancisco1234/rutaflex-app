import { useState } from 'react'
import { useApp } from '../context'
import { getDb, save, active } from '../store/db'
import { firstName, showErrors } from '../lib/utils'
import { ULIMA } from '../data/seed'
import { Empty, Heading, Field, Reputation } from '../components/ui'
import TripCard from '../components/TripCard'
import { PickMap } from '../components/maps'

// US10 · Panel del conductor
export function DriverHome() {
  const { db, me, current, go } = useApp()
  const ts = db.trips.filter(t => t.driver === current && active(t))
  const run = ts.find(t => t.status === 'En curso')
  return (
    <>
      <div className="hero">
        <div className="tag">Conductor</div>
        <h1>Hola, {firstName(me.name)}.<br />{run ? 'Tienes un viaje en curso.' : 'Listo para salir.'}</h1>
        <p className="muted">{me.car || 'Vehículo POR DEFINIR'} · <Reputation u={me} /></p>
        <div className="row" style={{ marginTop: 16 }}>
          {run && <button onClick={() => go('trip', run.id)}>Ir al viaje en curso →</button>}
          <button className={run ? 'secondary' : ''} onClick={() => go('publish')}>+ Publicar ruta</button>
        </div>
      </div>
      <div className="top">
        <div>
          <div className="tag">US10</div>
          <h2>Mis rutas activas</h2>
          <p className="muted">Inicia un viaje para activar el mapa en vivo y el botón Terminar viaje.</p>
        </div>
      </div>
      {ts.length
        ? <div className="grid">{ts.map(t => <TripCard key={t.id} t={t} />)}</div>
        : <Empty title="No existen rutas activas" text="Publica una ruta para empezar." />}
    </>
  )
}

// US09 · Publicar ruta
export function Publish() {
  const { current, go, toast } = useApp()
  const [err, setErr] = useState({})
  const [mode, setMode] = useState('origin')
  const [origin, setOrigin] = useState(null)
  const [dest, setDest] = useState(ULIMA)

  function onPick(kind, p) {
    if (kind === 'o') { setOrigin(p); setErr(e => ({ ...e, map: '' })) } else setDest(p)
  }

  function submit(e) {
    e.preventDefault()
    const f = new FormData(e.target)
    const o = String(f.get('origin')).trim(), d = String(f.get('dest')).trim(), time = String(f.get('time'))
    const seats = Number(f.get('seats')), p = String(f.get('price'))
    const er = {}
    if (!o) er.origin = 'Completa el punto de partida.'
    if (!d) er.dest = 'Completa el destino.'
    if (!time) er.time = 'Selecciona una hora.'
    if (!Number.isInteger(seats) || seats < 1) er.seats = 'Ingresa un número entero positivo de asientos.'
    if (p !== '' && Number(p) < 0) er.price = 'El precio no puede ser negativo.'
    if (!origin) er.map = 'Haz clic en el mapa para marcar el punto de partida.'
    if (showErrors(er, setErr)) return
    getDb().trips.push({ id: 'r' + Date.now(), driver: current, origin: o, dest: d, time, seats, price: p === '' ? null : Number(p), status: 'Activo', members: [current], stops: [], o: origin, d: dest || ULIMA, w: [] })
    save()
    go('dhome')
    toast('Ruta publicada. Ya es visible para los pasajeros.')
  }

  return (
    <>
      <Heading title="Comparte tu ruta" hu="US09 · Conductor" sub="Completa los datos y marca el recorrido en el mapa." />
      <div className="card form" style={{ maxWidth: 820 }}>
        <form onSubmit={submit} noValidate>
          <div className="grid">
            <Field id="origin" label="Punto de partida *" error={err.origin} />
            <Field id="dest" label="Destino *" defaultValue="Universidad de Lima" error={err.dest} />
            <Field id="time" label="Hora de salida *" type="time" error={err.time} />
            <Field id="seats" label="Asientos disponibles *" type="number" min="1" step="1" error={err.seats} />
          </div>
          <Field id="price" label="Precio por asiento · dato mock opcional" type="number" min="0" step="0.50" error={err.price} />
          <label>Recorrido en el mapa *</label>
          <div className="btnrow">
            <button type="button" className={mode === 'origin' ? '' : 'secondary'} onClick={() => setMode('origin')}>📍 Marcar partida</button>
            <button type="button" className={mode === 'dest' ? '' : 'secondary'} onClick={() => setMode('dest')}>🎓 Mover destino</button>
          </div>
          <PickMap mode={mode} onMode={setMode} onPick={onPick} />
          <div className="error">{err.map || ''}</div>
          <p className="muted">Haz clic en el mapa para marcar el punto de partida. El destino viene marcado en la Universidad de Lima; puedes moverlo.</p>
          <button className="full">Publicar ruta</button>
        </form>
      </div>
    </>
  )
}
