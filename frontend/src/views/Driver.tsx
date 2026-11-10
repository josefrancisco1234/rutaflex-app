import { useState } from 'react'
import type { FormEvent } from 'react'
import { useSession } from '../context'
import { getDb, save, active, trip, passengers, notify } from '../store/db'
import { apiEditTrip } from '../store/cloud'
import { firstName, showErrors } from '../lib/utils'
import type { FormErrors } from '../lib/utils'
import { clearRouteTried } from '../lib/route'
import { ULIMA } from '../data/seed'
import { Empty, Heading, Field, Reputation, Back } from '../components/ui'
import TripCard from '../components/TripCard'
import { PickMap } from '../components/maps'
import type { PickMode } from '../components/maps'
import type { LatLng, Trip } from '../types'

// US10 · Panel del conductor
export function DriverHome() {
  const { db, me, current, go } = useSession()
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
          <div className="tag">US10 · US11 · US12</div>
          <h2>Mis rutas activas</h2>
          <p className="muted">Edita o cancela una ruta antes de iniciarla. Inicia un viaje para activar el mapa en vivo.</p>
        </div>
      </div>
      {ts.length
        ? <div className="grid">{ts.map(t => <TripCard key={t.id} t={t} />)}</div>
        : <Empty title="No existen rutas activas" text="Publica una ruta para empezar." />}
    </>
  )
}

// Datos que devuelve el formulario de ruta ya validados.
interface RouteData { origin: string, dest: string, time: string, seats: number, price: number | null, stops: string[], o: LatLng, d: LatLng }

// Formulario compartido por US09 (publicar) y US11 (editar).
function RouteForm({ initial, minSeats = 1, submitLabel, onSubmit }: { initial?: Trip, minSeats?: number, submitLabel: string, onSubmit: (r: RouteData) => void | Promise<void> }) {
  const [err, setErr] = useState<FormErrors>({})
  const [mode, setMode] = useState<PickMode>(initial?.o ? 'dest' : 'origin')
  const [origin, setOrigin] = useState<LatLng | null>(initial?.o ?? null)
  const [dest, setDest] = useState<LatLng>(initial?.d ?? ULIMA)
  const [busy, setBusy] = useState(false)

  function onPick(kind: 'o' | 'd', p: LatLng) {
    if (kind === 'o') { setOrigin(p); setErr(e => ({ ...e, map: '' })) } else setDest(p)
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const o = String(f.get('origin')).trim(), d = String(f.get('dest')).trim(), time = String(f.get('time'))
    const seats = Number(f.get('seats')), p = String(f.get('price'))
    const stops = String(f.get('stops') || '').split(',').map(x => x.trim()).filter(Boolean)
    const er: FormErrors = {}
    if (!o) er.origin = 'Completa el punto de partida.'
    if (!d) er.dest = 'Completa el destino.'
    if (!time) er.time = 'Selecciona una hora.'
    if (!Number.isInteger(seats) || seats < minSeats) er.seats = minSeats === 0 ? 'Ingresa un número entero de asientos (0 o más).' : 'Ingresa un número entero positivo de asientos.'
    else if (seats > 6) er.seats = 'Máximo 6 asientos libres por vehículo.'
    if (p !== '' && Number(p) < 0) er.price = 'El precio no puede ser negativo.'
    if (!origin) er.map = 'Haz clic en el mapa para marcar el punto de partida.'
    if (showErrors(er, setErr) || !origin) return
    setBusy(true)
    await onSubmit({ origin: o, dest: d, time, seats, price: p === '' ? null : Number(p), stops, o: origin, d: dest || ULIMA })
    setBusy(false)
  }

  return (
    <div className="card form" style={{ maxWidth: 820 }}>
      <form onSubmit={submit} noValidate>
        <div className="grid">
          <Field id="origin" label="Punto de partida *" defaultValue={initial?.origin ?? ''} error={err.origin} />
          <Field id="dest" label="Destino *" defaultValue={initial?.dest ?? 'Universidad de Lima'} error={err.dest} />
          <Field id="time" label="Hora de salida *" type="time" defaultValue={initial?.time ?? ''} error={err.time} />
          <Field id="seats" label="Asientos disponibles *" type="number" min={String(minSeats)} max="6" step="1" defaultValue={initial ? String(initial.seats) : ''} error={err.seats} />
        </div>
        <div className="grid">
          <Field id="price" label="Precio por asiento · dato mock opcional" type="number" min="0" step="0.50" defaultValue={initial?.price != null ? String(initial.price) : ''} error={err.price} />
          <Field id="stops" label="Paradas (separadas por comas)" defaultValue={initial?.stops?.join(', ') ?? ''} placeholder="Ej. Av. Benavides, Javier Prado" />
        </div>
        <label>Recorrido en el mapa *</label>
        <div className="btnrow">
          <button type="button" className={mode === 'origin' ? '' : 'secondary'} onClick={() => setMode('origin')}>📍 Marcar partida</button>
          <button type="button" className={mode === 'dest' ? '' : 'secondary'} onClick={() => setMode('dest')}>🎓 Mover destino</button>
        </div>
        <PickMap mode={mode} onMode={setMode} onPick={onPick} origin={initial?.o} dest={initial?.d} />
        <div className="error">{err.map || ''}</div>
        <p className="muted">Haz clic en el mapa para marcar el punto de partida. El destino viene marcado en la Universidad de Lima; puedes moverlo.</p>
        <button className="full" disabled={busy}>{busy ? 'Guardando…' : submitLabel}</button>
      </form>
    </div>
  )
}

// US09 · Publicar ruta
export function Publish() {
  const { current, go, toast } = useSession()
  function publish(r: RouteData) {
    getDb().trips.push({ id: 'r' + Date.now(), driver: current, origin: r.origin, dest: r.dest, time: r.time, seats: r.seats, price: r.price, status: 'Activo', members: [current], stops: r.stops, o: r.o, d: r.d, w: [] })
    save()
    go('dhome')
    toast('Ruta publicada. Ya es visible para los pasajeros.')
  }
  return (
    <>
      <Heading title="Comparte tu ruta" hu="US09 · Conductor" sub="Completa los datos y marca el recorrido en el mapa." />
      <RouteForm submitLabel="Publicar ruta" onSubmit={publish} />
    </>
  )
}

const same = (a?: LatLng, b?: LatLng) => !!a && !!b && a[0] === b[0] && a[1] === b[1]

// US11 · Editar ruta publicada: solo el conductor y solo antes de iniciar el viaje.
export function EditTrip() {
  const { current, selected, go, toast } = useSession()
  const t = trip(selected)
  if (!t || t.driver !== current || t.status !== 'Activo') {
    return <>
      <Back go={go} to="dhome" />
      <Heading title="Edición no permitida" hu="US11" />
      <Empty title="No puedes editar esta ruta" text={!t ? 'La ruta no existe.' : t.driver !== current ? 'Solo el conductor que la publicó puede editarla.' : 'Solo se editan rutas activas que todavía no han iniciado.'} />
    </>
  }

  async function saveEdit(r: RouteData) {
    const t = trip(selected)
    if (!t || t.driver !== current || t.status !== 'Activo') return toast('La ruta ya no se puede editar.')
    const changes: string[] = []
    if (t.time !== r.time) changes.push('hora ' + t.time + ' → ' + r.time)
    if (t.origin !== r.origin || !same(t.o, r.o)) changes.push('partida: ' + r.origin)
    if (t.dest !== r.dest || !same(t.d, r.d)) changes.push('destino: ' + r.dest)
    if (t.price !== r.price) changes.push('precio')
    if ((t.stops || []).join() !== r.stops.join()) changes.push('paradas')
    if (t.seats !== r.seats) changes.push('asientos libres: ' + r.seats)
    const res = await apiEditTrip(t.id, current, { origin: r.origin, dest: r.dest, time: r.time, seats: r.seats, price: r.price, changes: changes.join(', ') })
    if (!res.ok) return toast('No se guardó: ' + res.error)
    const moved = !same(t.o, r.o) || !same(t.d, r.d)
    Object.assign(t, { origin: r.origin, dest: r.dest, time: r.time, seats: r.seats, price: r.price, stops: r.stops, o: r.o, d: r.d, editedAt: new Date().toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }) })
    if (moved) { delete t.path; delete t.km; delete t.mins; t.w = []; clearRouteTried() }
    // US16 · En modo local se avisa desde aquí; con el backend el aviso lo crea POST /api/edit-trip.
    if (!res.cloud && changes.length) notify(passengers(t), 'viaje', 'Tu viaje ' + r.origin + ' → ' + r.dest + ' fue modificado: ' + changes.join(', ') + '.', t.id)
    save()
    go('dhome')
    toast(changes.length ? 'Ruta actualizada. Se avisó a los pasajeros.' : 'Ruta guardada sin cambios.')
  }

  return (
    <>
      <Back go={go} to="trip" id={t.id} label="← Volver al viaje" />
      <Heading title="Editar ruta" hu="US11 · Conductor" sub={passengers(t).length + ' pasajero(s) confirmados recibirán un aviso con los cambios.'} />
      <RouteForm initial={t} minSeats={0} submitLabel="Guardar cambios" onSubmit={saveEdit} />
    </>
  )
}
