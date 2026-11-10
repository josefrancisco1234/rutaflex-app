import { useApp } from '../context'
import { getDb, user, save, replaceDb, trip, notify } from '../store/db'
import { cloudReady, resetCloud } from '../store/cloud'
import { clearRouteTried } from '../lib/route'
import { getPath } from '../lib/geo'
import { seed } from '../data/seed'

// Controles de la exposición (no son funciones del producto).
export default function DemoLab() {
  const app = useApp()
  const { current, me, isDriver, go, toast, rate, setCurrent } = app

  async function resetDemo() {
    setCurrent(null)
    app.resetSession()
    clearRouteTried()
    if (cloudReady()) {
      try { await resetCloud() } catch (e) { console.error(e); return toast('No se pudo reiniciar en el servidor.') }
    } else replaceDb(seed())
    go('login')
    toast('Datos de demostración restablecidos')
  }

  function newScenario() {
    if (!user('new')) getDb().users.push({ id: 'new', role: 'pasajero', name: 'Gabriel (cuenta nueva)', email: 'nuevo@aloe.ulima.edu.pe', pass: 'RutaFlex1!', scores: [], completed: 0 })
    save()
    setCurrent('new')
    go('history')
  }

  function simulateCompleted() {
    if (!current || !me) return
    const db = getDb()
    if (db.trips.some(t => t.id === 'h-demo-' + current)) return toast('El viaje de prueba ya está cargado')
    db.trips.push({ id: 'h-demo-' + current, driver: 'v', origin: 'La Molina', dest: 'Universidad de Lima', time: '09:30', seats: 0, price: 5, taxi: 15, status: 'Finalizado', members: [current, 'v'], date: '2026-10-15', ended: '09:52', km: 3.4, mins: 22 })
    me.completed++
    save()
    go('savings')
    toast('Viaje finalizado ficticio cargado; ahorro recalculado')
  }

  // US15 · Simula que el otro participante de t1 escribe (llega un aviso nuevo).
  function incomingMessage() {
    const t = trip('t1')
    if (!t || !current || !t.members.includes(current)) return toast('Necesitas participar en t1 (Gabriel o Andrea).')
    const from = t.members.find(id => id !== current)
    if (!from) return toast('No hay otro participante en t1.')
    ;(getDb().messages.t1 ??= []).push({ sender: from, text: '¿Sigue en pie el punto de encuentro?', time: new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) })
    notify([current], 'mensaje', (user(from)?.name || 'Alguien') + ' te escribió: “¿Sigue en pie el punto de encuentro?”', 't1')
    save()
  }

  // US19 · Simula la ubicación compartida del otro participante de t1 (sin GPS en el aula).
  function simulateShare() {
    const t = trip('t1')
    if (!t || !t.o) return toast('El viaje t1 no está disponible.')
    const who = t.members.find(id => id !== current) ?? t.members[0]
    ;(t.shares ??= {})[who] = { p: [t.o[0] + 0.0012, t.o[1] - 0.0009], at: Date.now() }
    save()
    go('trip', 't1')
    toast((user(who)?.name || 'Participante') + ' comparte su ubicación (simulada).')
  }

  function jumpToEnd() {
    const t = getDb().trips.find(x => x.driver === current && x.status === 'En curso')
    const p = t && getPath(t)
    if (!t || !p) return toast('No tienes un viaje en curso. Inicia uno primero.')
    t.progress = 1; t.gps = false; t.pos = p[p.length - 1]; t.arrived = true
    save()
    go('trip', t.id)
  }

  return (
    <details className="demo">
      <summary>Laboratorio de exposición · controles de datos, no funciones del producto</summary>
      <p className="muted">Escenarios simulados para comprobar restricciones. Tip: abre otra pestaña u otro dispositivo, entra como pasajero (Gabriel) y aquí como conductor (Andrea): el pasajero ve el auto moverse en vivo vía el servidor.</p>
      <button className="secondary" onClick={resetDemo}>Reiniciar demostración</button>
      {current && !isDriver && <>
        <button className="secondary" onClick={() => go('trip', 't1')}>Mi viaje (t1)</button>
        <button className="secondary" onClick={() => go('chat', 't2')}>Chat sin permiso</button>
        <button className="secondary" onClick={() => go('detail', 'missing')}>Viaje no disponible</button>
        <button className="secondary" onClick={() => rate('t1')}>Calificar viaje activo</button>
        <button className="secondary" onClick={newScenario}>Cuenta nueva sin registros</button>
        <button className="secondary" onClick={simulateCompleted}>Cargar viaje finalizado de prueba</button>
      </>}
      {current && <>
        <button className="secondary" onClick={incomingMessage}>Recibir mensaje en t1 (US15)</button>
        <button className="secondary" onClick={simulateShare}>Ubicación compartida simulada (US19)</button>
      </>}
      {current && isDriver && <>
        <button className="secondary" onClick={jumpToEnd}>Saltar al destino (viaje en curso)</button>
        <button className="secondary" onClick={() => go('chat', 't2')}>Chat sin permiso</button>
        <button className="secondary" onClick={() => go('edittrip', 't2')}>Editar ruta ajena (US11)</button>
      </>}
    </details>
  )
}
