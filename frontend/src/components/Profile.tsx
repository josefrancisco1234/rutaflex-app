import { RoleBadge, Reputation } from './ui'
import type { User } from '../types'

export default function Profile({ u }: { u: User }) {
  return (
    <div className="card">
      <div className="row">
        <span className="avatar">{u.name[0]}</span>
        <div>
          <h2>{u.name} {u.verified && <span className="verified" title="Identidad verificada con correo institucional">✔</span>}</h2>
          <p className="muted">Universidad de Lima{u.career ? ' · ' + u.career : ''} · usuario ficticio</p>
        </div>
      </div>
      <div className="row" style={{ margin: '14px 0' }}>
        <RoleBadge role={u.role} />
        {u.verified ? <span className="pill">✔ Identidad verificada</span> : <span className="pill muted-pill">Identidad sin verificar</span>}
      </div>
      {u.bio && <p>“{u.bio}”</p>}
      {(u.zone || u.prefTime) && <p className="muted">{u.zone ? '📍 ' + u.zone : ''}{u.zone && u.prefTime ? ' · ' : ''}{u.prefTime ? '🕒 suele viajar a las ' + u.prefTime : ''}</p>}
      {u.role === 'conductor' && <p>🚗 {u.car || 'Vehículo POR DEFINIR'}</p>}
      <div style={{ margin: '14px 0' }}><Reputation u={u} /></div>
      <p>{u.completed} viajes completados</p>
      <small>La reputación se recalcula con las evaluaciones registradas.</small>
    </div>
  )
}
