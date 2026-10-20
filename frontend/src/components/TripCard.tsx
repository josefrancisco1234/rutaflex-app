import { useSession } from '../context'
import { user, passengers } from '../store/db'
import { StatusPill, Price, Reputation } from './ui'
import type { Trip } from '../types'

export default function TripCard({ t }: { t: Trip }) {
  const { current, go } = useSession()
  const u = user(t.driver)
  const mine = t.driver === current
  const member = t.members.includes(current) && !mine
  const action = mine
    ? <button onClick={() => go('trip', t.id)}>{t.status === 'En curso' ? 'Ver viaje en curso →' : 'Gestionar viaje →'}</button>
    : member
      ? <button onClick={() => go('trip', t.id)}>Seguir mi viaje →</button>
      : <button className="secondary" onClick={() => go('detail', t.id)}>Ver viaje →</button>
  return (
    <article className="card">
      <div className="row between"><StatusPill t={t} /><Price t={t} /></div>
      <div className="tripline">
        <div><small>PUNTO DE PARTIDA</small><br /><strong>{t.origin}</strong></div>
        <div><small>DESTINO</small><br /><strong>{t.dest}</strong></div>
      </div>
      {mine
        ? <p className="muted">{passengers(t).length} pasajero(s) confirmados · {t.seats} asientos libres</p>
        : <div className="row"><span className="avatar">{u?.name[0]}</span><div><strong>{u?.name}</strong><br />{u && <Reputation u={u} />}</div></div>}
      <footer className="row between"><small>{t.seats} asientos disponibles</small>{action}</footer>
    </article>
  )
}
