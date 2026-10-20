import { useEffect, useRef, useState } from 'react'
import { useSession } from '../context'
import { getDb, trip, user, save, passengers, active } from '../store/db'
import { getPath, pathLen, pointAt, hav, km, liveNumbers } from '../lib/geo'
import { money, firstName } from '../lib/utils'
import { ULIMA } from '../data/seed'
import { Empty, Heading, StatusPill, Price, Back, Reputation } from '../components/ui'
import Profile from '../components/Profile'
import { TripMap } from '../components/maps'

// EXT-2 · EXT-3 · Seguir / gestionar el viaje en vivo
export default function TripView() {
  const { current, me, selected, go, toast, rate, setModal, homeView } = useSession()
  const t = trip(selected)
  const [sim, setSim] = useState(false)
  const [gps, setGps] = useState(false)
  const watch = useRef<number | null>(null)

  function stopGps() {
    if (watch.current !== null) { navigator.geolocation.clearWatch(watch.current); watch.current = null }
    setGps(false)
  }
  useEffect(() => () => { if (watch.current !== null) navigator.geolocation.clearWatch(watch.current) }, [])

  // Simulación del recorrido: avanza 0,8 % cada 250 ms.
  useEffect(() => {
    if (!sim) return
    const iv = setInterval(() => {
      const t = trip(selected)
      const p = t && getPath(t)
      if (!t || t.status !== 'En curso' || !p) return setSim(false)
      t.progress = Math.min(1, (t.progress || 0) + 0.008)
      t.pos = pointAt(p, t.progress)
      t.arrived = t.progress >= 1
      save()
      if (t.arrived) { setSim(false); toast('🏁 Llegaste al destino. Ya puedes terminar el viaje.') }
    }, 250)
    return () => clearInterval(iv)
  }, [sim, selected, toast])

  const u = t && user(t.driver)
  if (!t || !u) return <><Back go={go} to={homeView} /><Empty title="Viaje no encontrado" text="El viaje no existe." /></>
  const drv = t.driver === current, member = t.members.includes(current)
  if (!drv && !member) {
    return <>
      <Back go={go} to={homeView} />
      <Heading title="Acceso restringido" hu="Viaje" />
      <Empty title="No participas en este viaje" text="Reserva un asiento para seguirlo en el mapa." />
    </>
  }

  const ps = passengers(t), n = liveNumbers(t)
  const canChat = active(t) && member

  function startTrip() {
    const t = trip(selected)
    if (!t || t.driver !== current || t.status !== 'Activo') return
    if (getDb().trips.some(x => x.driver === current && x.status === 'En curso')) return toast('Ya tienes otro viaje en curso. Termínalo primero.')
    const p = getPath(t)
    Object.assign(t, { status: 'En curso', started: Date.now(), progress: 0, gps: false, arrived: false, pos: p ? p[0] : null })
    save()
    toast('Viaje iniciado. Los pasajeros ya ven tu ubicación.')
  }

  function toggleSim() {
    if (sim) return setSim(false)
    stopGps()
    const t = trip(selected)
    if (!t || t.status !== 'En curso') return
    if ((t.progress || 0) >= 1) { t.arrived = true; return save() }
    t.gps = false
    setSim(true)
  }

  function toggleGps() {
    if (gps) return stopGps()
    if (!navigator.geolocation) return toast('Tu navegador no permite geolocalización.')
    setSim(false)
    watch.current = navigator.geolocation.watchPosition(pos => {
      const t = trip(selected)
      if (!t || t.status !== 'En curso') return stopGps()
      t.gps = true
      t.pos = [pos.coords.latitude, pos.coords.longitude]
      t.arrived = hav(t.pos, t.d || ULIMA) <= 150
      save()
    }, e => { stopGps(); toast('No se pudo obtener tu ubicación: ' + e.message) }, { enableHighAccuracy: true, maximumAge: 3000 })
    setGps(true)
    toast('GPS activado. Terminar viaje se habilita a menos de 150 m del destino.')
  }

  function endTrip() {
    const t = trip(selected)
    if (!t || t.driver !== current || t.status !== 'En curso') return
    if (!t.arrived) return toast('Aún no llegas al destino.')
    setSim(false)
    stopGps()
    const p = getPath(t), dist = t.km || (p ? pathLen(p) / 1000 : 0)
    const mins = t.started ? Math.max(1, Math.round((Date.now() - t.started) / 60000)) : null
    t.status = 'Finalizado'
    t.date = new Date().toISOString().slice(0, 10)
    t.ended = new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
    t.km = dist
    t.taxi = Math.max((t.price || 0) + 5, Math.round(8 + dist * 2.2))
    t.members.forEach(id => { const x = user(id); if (x) x.completed++ })
    save()
    setModal({ type: 'end', dest: t.dest, dist, mins, ps: ps.length, income: (t.price || 0) * ps.length })
    toast('Viaje terminado y registrado en el historial.')
  }

  const passengerList = <>
    <h3>Pasajeros ({ps.length})</h3>
    {ps.length
      ? <ul className="passlist">{ps.map(id => { const x = user(id); return x && <li key={id}><span className="avatar">{x.name[0]}</span><div><strong>{x.name}</strong><br /><Reputation u={x} /></div></li> })}</ul>
      : <p className="muted">Aún no hay pasajeros. Puedes salir igual.</p>}
  </>

  let right
  if (drv) {
    if (t.status === 'Activo') right = (
      <div className="card">
        <div className="tag">Conductor</div>
        <h2>Listo para salir</h2>
        <p className="muted">Salida {t.time} · {me.car || 'Vehículo POR DEFINIR'}</p>
        {passengerList}
        <button className="full" onClick={startTrip}>🚦 Iniciar viaje</button>
        {canChat && <button className="secondary full" style={{ marginTop: 10 }} onClick={() => go('chat', t.id)}>Abrir chat del viaje</button>}
      </div>
    )
    else if (t.status === 'En curso') right = (
      <div className="card">
        <div className="tag">Viaje en curso</div>
        <h2>Rumbo a {t.dest}</h2>
        <p className="muted">Avanza hasta el destino. Para la exposición usa la simulación; en el celular puedes usar el GPS real.</p>
        <div className="btnrow">
          <button className="secondary" onClick={toggleSim}>{sim ? '⏸ Pausar simulación' : (t.progress || 0) > 0 ? '▶ Continuar simulación' : '▶ Simular recorrido'}</button>
          <button className="secondary" onClick={toggleGps}>{gps ? '📡 Detener GPS' : '📡 Usar mi GPS real'}</button>
        </div>
        {passengerList}
        <button className="full finish" onClick={endTrip} disabled={!t.arrived}>🏁 Terminar viaje</button>
        <p className="muted" style={{ marginTop: 10 }}>{t.arrived ? '✅ Llegaste al destino. Ya puedes terminar el viaje.' : 'Se habilita al llegar a la ubicación de destino.'}</p>
        <button className="secondary full" onClick={() => go('chat', t.id)}>Abrir chat del viaje</button>
      </div>
    )
    else right = (
      <div className="card">
        <div className="tag">Finalizado</div>
        <h2>Viaje terminado</h2>
        <p className="muted">{t.date}{t.ended ? ' · ' + t.ended : ''}</p>
        <p>{ps.length} pasajero(s) · {t.km ? t.km.toFixed(1) + ' km' : ''}</p>
        <p>Ingresos: <strong>{money((t.price || 0) * ps.length)}</strong></p>
        <button className="full" onClick={() => go('history')}>Ver historial</button>
      </div>
    )
  } else {
    const status = t.status === 'Activo'
      ? <div className="alert">⏳ Esperando a que {firstName(u.name)} inicie el viaje ({t.time}).</div>
      : t.status === 'En curso'
        ? <div className="alert">🚗 Tu conductor va en camino. El mapa se actualiza en vivo.</div>
        : <><div className="alert">🏁 Viaje terminado. ¡Llegaste a {t.dest}!</div><button className="full" onClick={() => rate(t.id)}>Calificar a {firstName(u.name)}</button></>
    right = <>
      <div className="card">
        <div className="tag">Pasajero</div>
        <h2>Tu viaje</h2>
        {status}
        {canChat && <button className="secondary full" onClick={() => go('chat', t.id)}>Abrir chat del viaje</button>}
      </div>
      <Profile u={u} />
    </>
  }

  return (
    <>
      <Back go={go} to={drv ? 'dhome' : 'mytrips'} />
      <Heading title={drv ? 'Gestionar viaje' : 'Seguir mi viaje'} hu="Mapa interactivo" sub={t.origin + ' → ' + t.dest} />
      <div className="split">
        <div className="card">
          <div className="row between"><StatusPill t={t} /><Price t={t} /></div>
          <TripMap t={t} />
          <div className="legend"><span>📍 Partida</span><span>🎓 Destino</span><span>◯ Paradas</span><span>🚗 Conductor</span><span>— Ruta</span></div>
          <div style={{ marginTop: 14 }}>
            <small>AVANCE DEL VIAJE</small>
            <div className="progress"><div style={{ width: n.pct + '%' }} /></div>
          </div>
          <div className="stats">
            <div><small>Avance</small><strong>{Math.round(n.pct)}%</strong></div>
            <div><small>Distancia restante</small><strong>{km(n.rem)}</strong></div>
            <div><small>Llegada estimada</small><strong>{t.status === 'En curso' ? Math.max(1, Math.round(n.rem / 1000 * 2.4)) + ' min' : '—'}</strong></div>
          </div>
        </div>
        <div>{right}</div>
      </div>
    </>
  )
}
