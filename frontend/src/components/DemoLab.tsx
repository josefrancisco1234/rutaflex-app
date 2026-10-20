import { useApp } from '../context'
import { getDb, user, save, replaceDb } from '../store/db'
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
      try { await resetCloud() } catch (e) { console.error(e); return toast('No se pudo reiniciar en Supabase.') }
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
    db.trips.push({ id: 'h-demo-' + current, driver: 'v', origin: 'La Molina', dest: 'Universidad de Lima', time: '09:30', seats: 0, price: 5, taxi: 15, status: 'Finalizado', members: [current, 'v'], date: '2026-10-15' })
    me.completed++
    save()
    go('savings')
    toast('Viaje finalizado ficticio cargado; ahorro recalculado')
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
      <p className="muted">Escenarios simulados para comprobar restricciones. Tip: abre otra pestaña u otro dispositivo, entra como pasajero (Gabriel) y aquí como conductor (Andrea): el pasajero ve el auto moverse en vivo vía Supabase.</p>
      <button className="secondary" onClick={resetDemo}>Reiniciar demostración</button>
      {current && !isDriver && <>
        <button className="secondary" onClick={() => go('trip', 't1')}>Mi viaje (t1)</button>
        <button className="secondary" onClick={() => go('chat', 't2')}>Chat sin permiso</button>
        <button className="secondary" onClick={() => go('detail', 'missing')}>Viaje no disponible</button>
        <button className="secondary" onClick={() => rate('t1')}>Calificar viaje activo</button>
        <button className="secondary" onClick={newScenario}>Cuenta nueva sin registros</button>
        <button className="secondary" onClick={simulateCompleted}>Cargar viaje finalizado de prueba</button>
      </>}
      {current && isDriver && <>
        <button className="secondary" onClick={jumpToEnd}>Saltar al destino (viaje en curso)</button>
        <button className="secondary" onClick={() => go('chat', 't2')}>Chat sin permiso</button>
      </>}
    </details>
  )
}
