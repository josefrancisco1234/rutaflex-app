import { useState } from 'react'
import { useSession } from '../context'
import { getDb, notify, save, user } from '../store/db'
import { apiAdminBan, apiAdminDelete, apiAdminReview, refreshCloud } from '../store/cloud'
import type { ApiResult } from '../store/cloud'
import { localBan, localDelete } from '../store/admin'
import { norm } from '../lib/utils'
import { Empty, Heading, RoleBadge } from '../components/ui'
import type { DriverStatus, Role, User } from '../types'

const day = (iso?: string) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(+d) ? iso : d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
}
const today = () => new Date().toISOString().slice(0, 10)

// Estado de la cuenta tal como lo ve el administrador.
function AccountState({ u }: { u: User }) {
  if (u.banned) return <span className="pill state bad" title={u.banReason}>⛔ Suspendido</span>
  if (u.role === 'conductor' && u.driverStatus === 'pendiente') return <span className="pill state warn">⏳ Solicitud en revisión</span>
  if (u.role === 'conductor' && u.driverStatus === 'rechazado') return <span className="pill state bad">✖ Solicitud rechazada</span>
  return <span className="pill state">● Activo</span>
}

// Ejecuta una acción de admin: con backend la valida el servidor y se refrescan los datos;
// sin backend se aplica en local.
function useAdminAction() {
  const { toast } = useSession()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function run(call: Promise<ApiResult>, local: () => void, ok: string) {
    setBusy(true); setError('')
    const res = await call
    setBusy(false)
    if (!res.ok) { setError(res.error || 'No se pudo completar la acción.'); return false }
    if (res.cloud) await refreshCloud()
    else { local(); save() }
    toast(ok)
    return true
  }
  return { busy, error, setError, run }
}

type Dialog = { type: 'ban' | 'delete' | 'reject', id: string } | null

// ---------- Lista de usuarios registrados ----------
export function AdminUsers() {
  const { db, current, go } = useSession()
  const [q, setQ] = useState('')
  const [role, setRole] = useState<'todos' | Role>('todos')
  const [dialog, setDialog] = useState<Dialog>(null)
  const act = useAdminAction()

  const list = db.users
    .filter(u => role === 'todos' || u.role === role)
    .filter(u => !q || norm(u.name + ' ' + u.email).includes(norm(q)))
    .sort((a, b) => (a.role === 'admin' ? -1 : 0) - (b.role === 'admin' ? -1 : 0) || a.name.localeCompare(b.name))
  const count = (r: Role) => db.users.filter(u => u.role === r).length
  const pending = db.users.filter(u => u.role === 'conductor' && u.driverStatus === 'pendiente').length

  async function unban(u: User) {
    await act.run(apiAdminBan(current, u.id, false), () => localBan(u.id, false, ''), u.name + ' fue reactivado. Ya puede iniciar sesión.')
  }

  return (
    <>
      <Heading title="Usuarios registrados" hu="Administración" sub="Consulta las cuentas, suspende o elimina usuarios que incumplan las normas." />
      <div className="stats adminstats">
        <div><small>Usuarios</small><strong>{db.users.length}</strong></div>
        <div><small>Pasajeros</small><strong>{count('pasajero')}</strong></div>
        <div><small>Conductores</small><strong>{count('conductor')}</strong></div>
        <div><small>Suspendidos</small><strong>{db.users.filter(u => u.banned).length}</strong></div>
        <button className={'secondary' + (pending ? ' attention' : '')} onClick={() => go('requests')}>
          <small>Solicitudes pendientes</small><strong>{pending}</strong>
        </button>
      </div>
      <div className="card filters">
        <div className="row">
          <input aria-label="Buscar por nombre o correo" placeholder="Buscar por nombre o correo" value={q} onChange={e => setQ(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
          <select aria-label="Filtrar por rol" value={role} onChange={e => setRole(e.target.value as typeof role)} style={{ width: 'auto' }}>
            <option value="todos">Todos los roles</option>
            <option value="pasajero">Pasajeros</option>
            <option value="conductor">Conductores</option>
            <option value="admin">Administradores</option>
          </select>
        </div>
      </div>
      {act.error && !dialog && <div className="alert bad">{act.error}</div>}
      {list.length ? (
        <div className="card tablewrap">
          <table className="admintable">
            <thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th>Registro</th><th>Acciones</th></tr></thead>
            <tbody>
              {list.map(u => (
                <tr key={u.id}>
                  <td><strong>{u.name}</strong>{u.id === current && <small> (tú)</small>}<br /><small>{u.email}</small></td>
                  <td><RoleBadge role={u.role} /></td>
                  <td><AccountState u={u} />{u.banned && u.banReason && <><br /><small>Motivo: {u.banReason}</small></>}</td>
                  <td><small>{day(u.createdAt)}</small></td>
                  <td>
                    {u.role === 'admin' ? <small>—</small> : (
                      <div className="row actions">
                        {u.role === 'conductor' && u.driverStatus === 'pendiente' && <button className="secondary" onClick={() => go('requests')}>Revisar</button>}
                        {u.banned
                          ? <button className="secondary" disabled={act.busy} onClick={() => unban(u)}>Reactivar</button>
                          : <button className="secondary dangertext" onClick={() => { act.setError(''); setDialog({ type: 'ban', id: u.id }) }}>Suspender</button>}
                        <button className="danger" onClick={() => { act.setError(''); setDialog({ type: 'delete', id: u.id }) }}>Eliminar</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty title="Sin resultados" text="No hay usuarios que coincidan con la búsqueda." />}
      {dialog?.type === 'ban' && <BanDialog id={dialog.id} act={act} close={() => setDialog(null)} />}
      {dialog?.type === 'delete' && <DeleteDialog id={dialog.id} act={act} close={() => setDialog(null)} />}
    </>
  )
}

type Act = ReturnType<typeof useAdminAction>

function activeTrips(id: string) {
  const ts = getDb().trips.filter(t => t.status === 'Activo')
  return { driving: ts.filter(t => t.driver === id).length, riding: ts.filter(t => t.driver !== id && t.members.includes(id)).length }
}
function Consequences({ id }: { id: string }) {
  const { driving, riding } = activeTrips(id)
  if (!driving && !riding) return null
  return <p className="muted">{[
    driving && `Se cancelarán ${driving} viaje(s) por iniciar que conduce y se avisará a sus pasajeros.`,
    riding && `Se liberarán ${riding} asiento(s) que tenía reservados.`,
  ].filter(Boolean).join(' ')}</p>
}

function BanDialog({ id, act, close }: { id: string, act: Act, close: () => void }) {
  const { current } = useSession()
  const [reason, setReason] = useState('')
  const u = user(id)
  async function confirm() {
    const r = reason.trim()
    if (r.length < 3) return act.setError('Escribe el motivo de la suspensión.')
    if (await act.run(apiAdminBan(current, id, true, r), () => localBan(id, true, r), (u?.name || 'El usuario') + ' fue suspendido.')) close()
  }
  return (
    <div className="overlay">
      <div className="card modal" role="dialog" aria-modal="true" aria-labelledby="ban-title">
        <div className="tag">Administración</div>
        <h2 id="ban-title">Suspender a {u?.name}</h2>
        <div className="alert bad">No podrá iniciar sesión hasta que lo reactives. Su sesión abierta se cerrará.</div>
        <Consequences id={id} />
        <div className="field">
          <label htmlFor="banreason">Motivo *</label>
          <textarea id="banreason" rows={3} maxLength={200} value={reason} onChange={e => { setReason(e.target.value); act.setError('') }} placeholder="Ej. Reportes de conducta inapropiada" />
        </div>
        <div className="error">{act.error}</div>
        <div className="row">
          <button className="danger" onClick={confirm} disabled={act.busy}>{act.busy ? 'Suspendiendo…' : 'Suspender cuenta'}</button>
          <button className="secondary" onClick={close}>Volver</button>
        </div>
      </div>
    </div>
  )
}

function DeleteDialog({ id, act, close }: { id: string, act: Act, close: () => void }) {
  const { current } = useSession()
  const u = user(id)
  async function confirm() {
    if (await act.run(apiAdminDelete(current, id), () => localDelete(id), (u?.name || 'El usuario') + ' fue eliminado.')) close()
  }
  return (
    <div className="overlay">
      <div className="card modal" role="dialog" aria-modal="true" aria-labelledby="del-title">
        <div className="tag">Administración</div>
        <h2 id="del-title">Eliminar a {u?.name}</h2>
        <p className="muted">{u?.email}</p>
        <div className="alert bad">Se borrará la cuenta con sus viajes como conductor, mensajes, calificaciones y avisos. Esta acción no se puede deshacer.</div>
        <Consequences id={id} />
        <div className="error">{act.error}</div>
        <div className="row">
          <button className="danger" onClick={confirm} disabled={act.busy}>{act.busy ? 'Eliminando…' : 'Eliminar definitivamente'}</button>
          <button className="secondary" onClick={close}>Volver</button>
        </div>
      </div>
    </div>
  )
}

// ---------- Solicitudes de conductor ----------
const TABS: [DriverStatus, string][] = [['pendiente', 'Pendientes'], ['aprobado', 'Aprobadas'], ['rechazado', 'Rechazadas']]

export function AdminRequests() {
  const { db, current } = useSession()
  const [tab, setTab] = useState<DriverStatus>('pendiente')
  const [rejecting, setRejecting] = useState<string | null>(null)
  const act = useAdminAction()
  const drivers = db.users.filter(u => u.role === 'conductor')
  const list = drivers.filter(u => u.driverStatus === tab)
    .sort((a, b) => (a.application?.submittedAt || '').localeCompare(b.application?.submittedAt || ''))

  async function approve(u: User) {
    await act.run(apiAdminReview(current, u.id, true), () => {
      const x = user(u.id)
      if (!x) return
      x.driverStatus = 'aprobado'; delete x.rejectReason; x.reviewedAt = new Date().toISOString().slice(0, 16).replace('T', ' '); x.reviewedBy = current
      notify([u.id], 'cuenta', '¡Tu solicitud de conductor fue aprobada! Ya puedes publicar tus rutas.')
    }, u.name + ' fue aprobado como conductor. Se le notificó.')
  }

  return (
    <>
      <Heading title="Solicitudes de conductor" hu="Administración" sub="Revisa los datos de cada postulante y decide si es apto para conducir en RutaFlex." />
      <div className="btnrow" role="group" aria-label="Filtrar solicitudes" style={{ maxWidth: 560 }}>
        {TABS.map(([k, label]) => {
          const n = drivers.filter(u => u.driverStatus === k).length
          return <button key={k} className={tab === k ? '' : 'secondary'} onClick={() => setTab(k)}>{label} ({n})</button>
        })}
      </div>
      {act.error && !rejecting && <div className="alert bad">{act.error}</div>}
      {list.length ? (
        <div className="reqlist">
          {list.map(u => {
            const a = u.application
            const expired = !!a?.soat && a.soat < today()
            return (
              <div key={u.id} className="card">
                <div className="row between">
                  <div className="row">
                    <span className="avatar">{u.name[0]}</span>
                    <div><h3 style={{ margin: 0 }}>{u.name}</h3><small>{u.email}{u.career ? ' · ' + u.career : ''}</small></div>
                  </div>
                  <AccountState u={u} />
                </div>
                <dl className="detail">
                  <div><dt>Vehículo</dt><dd>{a?.model || u.car || '—'}</dd></div>
                  <div><dt>Placa</dt><dd>{a?.plate || '—'}</dd></div>
                  <div><dt>Licencia</dt><dd>{a?.license || '—'}</dd></div>
                  <div><dt>SOAT vence</dt><dd className={expired ? 'bad' : ''}>{a?.soat ? day(a.soat + 'T12:00') + (expired ? ' · vencido' : '') : '—'}</dd></div>
                  <div><dt>Celular</dt><dd>{u.phone || '—'}</dd></div>
                  <div><dt>Enviada</dt><dd>{a?.submittedAt ? day(a.submittedAt + 'T12:00') : '—'}</dd></div>
                </dl>
                {!a && <p className="muted" style={{ marginTop: 12 }}>Conductor registrado antes de la revisión por un administrador (sin formulario).</p>}
                {u.driverStatus === 'rechazado' && <div className="alert bad">Motivo del rechazo: {u.rejectReason}</div>}
                {u.driverStatus !== 'pendiente' && u.reviewedAt && <small>Revisada el {u.reviewedAt}{u.reviewedBy ? ' por ' + (user(u.reviewedBy)?.name || 'un administrador') : ''}.</small>}
                {u.driverStatus === 'pendiente' && (
                  <footer className="row">
                    <button onClick={() => approve(u)} disabled={act.busy}>✔ Apto · Aprobar</button>
                    <button className="danger" onClick={() => { act.setError(''); setRejecting(u.id) }} disabled={act.busy}>✖ No apto · Rechazar</button>
                  </footer>
                )}
              </div>
            )
          })}
        </div>
      ) : <Empty title={tab === 'pendiente' ? 'No hay solicitudes pendientes' : 'Sin solicitudes'} text={tab === 'pendiente' ? 'Cuando alguien se registre como conductor, su solicitud aparecerá aquí.' : 'No hay solicitudes en este estado.'} />}
      {rejecting && <RejectDialog id={rejecting} act={act} close={() => setRejecting(null)} />}
    </>
  )
}

const REJECT_REASONS = ['El SOAT está vencido', 'La licencia de conducir no es válida', 'Los datos del vehículo no coinciden con la placa', 'Información incompleta o ilegible']

function RejectDialog({ id, act, close }: { id: string, act: Act, close: () => void }) {
  const { current } = useSession()
  const [reason, setReason] = useState('')
  const u = user(id)
  async function confirm() {
    const r = reason.trim()
    if (r.length < 5) return act.setError('Escribe el motivo del rechazo (mínimo 5 caracteres). Se le notificará al postulante.')
    const ok = await act.run(apiAdminReview(current, id, false, r), () => {
      const x = user(id)
      if (!x) return
      x.driverStatus = 'rechazado'; x.rejectReason = r; x.reviewedAt = new Date().toISOString().slice(0, 16).replace('T', ' '); x.reviewedBy = current
      notify([id], 'cuenta', 'Tu solicitud de conductor fue rechazada. Motivo: ' + r + '. Puedes corregir tus datos y enviarla de nuevo.')
    }, 'Solicitud rechazada. Se notificó el motivo a ' + (u?.name || 'el postulante') + '.')
    if (ok) close()
  }
  return (
    <div className="overlay">
      <div className="card modal" role="dialog" aria-modal="true" aria-labelledby="rej-title">
        <div className="tag">Solicitud de conductor</div>
        <h2 id="rej-title">Rechazar a {u?.name}</h2>
        <p className="muted">El motivo se le notificará para que pueda corregir sus datos y volver a postular.</p>
        <div className="chips">
          {REJECT_REASONS.map(r => <button key={r} className="secondary" onClick={() => { setReason(r); act.setError('') }}>{r}</button>)}
        </div>
        <div className="field">
          <label htmlFor="rejreason">Motivo del rechazo *</label>
          <textarea id="rejreason" rows={3} maxLength={300} value={reason} onChange={e => { setReason(e.target.value); act.setError('') }} />
        </div>
        <div className="error">{act.error}</div>
        <div className="row">
          <button className="danger" onClick={confirm} disabled={act.busy}>{act.busy ? 'Rechazando…' : 'Rechazar y notificar'}</button>
          <button className="secondary" onClick={close}>Volver</button>
        </div>
      </div>
    </div>
  )
}
