import { money } from '../lib/utils'

export function Empty({ title, text }) {
  return (
    <div className="card empty">
      <div className="symbol">◇</div>
      <h3>{title}</h3>
      <p className="muted">{text}</p>
    </div>
  )
}

export function Heading({ title, hu, sub = '' }) {
  return (
    <div className="top">
      <div>
        <div className="tag">{hu}</div>
        <h1>{title}</h1>
        <p className="muted">{sub}</p>
      </div>
    </div>
  )
}

export function Field({ id, label, type = 'text', defaultValue = '', error, ...rest }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={id} type={type} defaultValue={defaultValue} className={error ? 'invalid' : ''} {...rest} />
      <div className="error">{error || ''}</div>
    </div>
  )
}

export function Reputation({ u }) {
  if (!u.scores.length) return <span className="muted">Sin calificaciones registradas</span>
  const avg = (u.scores.reduce((a, b) => a + b, 0) / u.scores.length).toFixed(1)
  return <><span className="stars">★</span> {avg} <small>({u.scores.length} calificaciones)</small></>
}

export function RoleBadge({ role }) {
  return role === 'conductor'
    ? <span className="rolebadge conductor">🚗 Conductor</span>
    : <span className="rolebadge pasajero">🎒 Pasajero</span>
}

export function StatusPill({ t }) {
  const style = t.status === 'En curso' ? { background: '#fff3dc', color: '#8a5a00' }
    : t.status === 'Finalizado' ? { background: '#eef1f3', color: '#607783' } : undefined
  return <span className="pill" style={style}>{t.status} · {t.time}</span>
}

export function Price({ t, suffix = '', empty = 'POR DEFINIR' }) {
  return <span className="price">{t.price == null ? empty : money(t.price) + suffix}</span>
}

export function Back({ to, id, label = '← Volver', go }) {
  return <button className="secondary back" onClick={() => go(to, id)}>{label}</button>
}
