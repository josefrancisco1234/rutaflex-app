import { useSession } from '../context'
import { user, passengers } from '../store/db'
import { money } from '../lib/utils'
import { Empty, Heading } from '../components/ui'
import Profile from '../components/Profile'
import type { Db, Trip } from '../types'

const historyTrips = (db: Db, current: string) => db.trips.filter(t => t.status === 'Finalizado' && t.members.includes(current))

// US21 · US18 · Historial
export function History() {
  const { db, current, rate } = useSession()
  const ts = historyTrips(db, current)
  return (
    <>
      <Heading title="Tu historial" hu="US21 · US18" sub="Lista simple de viajes anteriores." />
      {ts.length ? ts.slice().reverse().map(t => {
        const drv = t.driver === current, ps = passengers(t)
        return (
          <div key={t.id} className="card top" style={{ marginBottom: 14 }}>
            <div>
              <span className="pill" style={{ background: '#eef1f3', color: '#607783' }}>Finalizado</span>
              <h3>{t.origin} → {t.dest}</h3>
              <p className="muted">{t.date} · {drv ? 'Tú como conductor · ' + ps.length + ' pasajero(s)' : user(t.driver)?.name}{t.km ? ' · ' + t.km.toFixed(1) + ' km' : ''}</p>
            </div>
            {drv
              ? ps.length > 0 && <button className="secondary" onClick={() => rate(t.id)}>Calificar pasajero</button>
              : <button className="secondary" onClick={() => rate(t.id)}>Calificar conductor</button>}
          </div>
        )
      }) : <Empty title="El usuario todavía no tiene viajes registrados" text="Tus viajes anteriores aparecerán aquí." />}
    </>
  )
}

// US22 · Ahorro del pasajero
export function Savings() {
  const { db, current } = useSession()
  const ts = historyTrips(db, current).filter(t => t.driver !== current)
  const saving = (t: Trip) => (t.taxi || 0) - (t.price || 0)
  const total = ts.reduce((a, t) => a + saving(t), 0)
  return (
    <>
      <Heading title="Cada viaje cuenta" hu="US22" sub="Ahorro económico estimado con datos ficticios." />
      {ts.length ? (
        <div className="split">
          <div className="card">
            <div className="tag">Ahorro acumulado</div>
            <div className="metric">{money(total)}</div>
            <p className="muted">En {ts.length} viajes compartidos finalizados.</p>
            <div className="alert">Ahorro = tarifa estimada de taxi − costo compartido</div>
            <small>Tarifas de taxi simuladas. Proveedor, metodología de estimación y tratamiento de diferencias negativas: POR DEFINIR.</small>
          </div>
          <div className="card">
            <h3>Cálculo básico por viaje</h3>
            {ts.map(t => (
              <div key={t.id} className="row between" style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
                <div><strong>{t.origin}</strong><br /><small>{money(t.taxi || 0)} − {money(t.price || 0)}</small></div>
                <strong>{money(saving(t))}</strong>
              </div>
            ))}
          </div>
        </div>
      ) : <Empty title="No existen datos suficientes para el cálculo" text="Aún no tienes viajes compartidos registrados." />}
    </>
  )
}

// US22 · Ganancias del conductor
export function Earnings() {
  const { db, current } = useSession()
  const ts = historyTrips(db, current).filter(t => t.driver === current)
  const income = (t: Trip) => (t.price || 0) * passengers(t).length
  const total = ts.reduce((a, t) => a + income(t), 0)
  return (
    <>
      <Heading title="Tus ganancias" hu="Conductor" sub="Ingresos estimados por asientos compartidos (datos ficticios)." />
      {ts.length ? (
        <div className="split">
          <div className="card">
            <div className="tag">Total acumulado</div>
            <div className="metric">{money(total)}</div>
            <p className="muted">En {ts.length} viajes terminados.</p>
            <div className="alert">Ingreso = precio por asiento × pasajeros</div>
            <small>Pagos reales y comisiones: POR DEFINIR.</small>
          </div>
          <div className="card">
            <h3>Detalle por viaje</h3>
            {ts.slice().reverse().map(t => (
              <div key={t.id} className="row between" style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
                <div><strong>{t.origin}</strong><br /><small>{t.date} · {money(t.price || 0)} × {passengers(t).length}</small></div>
                <strong>{money(income(t))}</strong>
              </div>
            ))}
          </div>
        </div>
      ) : <Empty title="Aún no tienes viajes terminados" text="Inicia y termina un viaje para ver tus ganancias." />}
    </>
  )
}

// US17 · Perfil
export function ProfileView() {
  const { me } = useSession()
  return (
    <>
      <Heading title="Mi perfil" hu="US17" sub="Información de consulta. Sin edición de perfil." />
      <Profile u={me} />
    </>
  )
}
