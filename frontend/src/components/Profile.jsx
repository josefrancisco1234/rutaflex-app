import { RoleBadge, Reputation } from './ui'

export default function Profile({ u }) {
  return (
    <div className="card">
      <div className="row">
        <span className="avatar">{u.name[0]}</span>
        <div><h2>{u.name}</h2><p className="muted">Universidad de Lima · usuario ficticio</p></div>
      </div>
      <div style={{ margin: '14px 0' }}><RoleBadge role={u.role} /></div>
      {u.role === 'conductor' && <p>🚗 {u.car || 'Vehículo POR DEFINIR'}</p>}
      <div style={{ margin: '14px 0' }}><Reputation u={u} /></div>
      <p>{u.completed} viajes completados</p>
      <small>La reputación se recalcula con las evaluaciones registradas.</small>
    </div>
  )
}
