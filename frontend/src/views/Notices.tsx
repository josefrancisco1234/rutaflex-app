import { useState } from 'react'
import { useSession } from '../context'
import { trip, active } from '../store/db'
import { Empty, Heading } from '../components/ui'
import type { NoticeKind } from '../types'

const when = (iso: string) => {
  const d = new Date(iso)
  if (isNaN(+d)) return iso
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }) + ' · ' + d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
}

// US15 · US16 · Notificaciones de mensajes y de cambios en los viajes.
export default function Notices() {
  const { db, current, isDriver, go, unread, markAllRead, toast } = useSession()
  const [kind, setKind] = useState<'todas' | NoticeKind>('todas')
  const [perm, setPerm] = useState(() => ('Notification' in window ? Notification.permission : 'denied'))
  const list = db.notices.filter(n => n.to === current && (kind === 'todas' || n.kind === kind)).slice().sort((a, b) => b.at.localeCompare(a.at))

  function open(tripId?: string, k?: NoticeKind) {
    const t = tripId ? trip(tripId) : undefined
    if (!t) return toast('El viaje ya no está disponible.')
    if (k === 'mensaje' && active(t) && t.members.includes(current)) return go('chat', t.id)
    if (t.status === 'Finalizado' || t.status === 'Cancelado') return go('history')
    if (t.members.includes(current)) return go('trip', t.id)
    return go(isDriver ? 'dhome' : 'detail', t.id)
  }

  async function enableBrowser() {
    if (!('Notification' in window)) return toast('Tu navegador no admite notificaciones.')
    const p = await Notification.requestPermission()
    setPerm(p)
    toast(p === 'granted' ? 'Notificaciones del navegador activadas.' : 'Permiso denegado por el navegador.')
  }

  return (
    <>
      <Heading title="Notificaciones" hu="US15 · US16" sub="Avisos de mensajes nuevos y de cambios en tus viajes." />
      <div className="row between" style={{ marginBottom: 16 }}>
        <div className="btnrow" role="group" aria-label="Filtrar notificaciones" style={{ margin: 0 }}>
          {(['todas', 'mensaje', 'viaje'] as const).map(k => (
            <button key={k} className={kind === k ? '' : 'secondary'} onClick={() => setKind(k)}>
              {k === 'todas' ? 'Todas' : k === 'mensaje' ? '💬 Mensajes' : '🚗 Viajes'}
            </button>
          ))}
        </div>
        <div className="row">
          {perm !== 'granted' && <button className="secondary" onClick={enableBrowser}>Activar avisos del navegador</button>}
          <button className="secondary" onClick={markAllRead} disabled={!unread}>Marcar todo como leído</button>
        </div>
      </div>
      {list.length ? (
        <div className="card noticelist">
          {list.map(n => (
            <button key={n.id} className={'notice' + (n.read ? '' : ' unread')} onClick={() => open(n.trip, n.kind)}>
              <span className="nicon">{n.kind === 'mensaje' ? '💬' : '🚗'}</span>
              <span className="nbody"><span>{n.text}</span><small>{when(n.at)}{n.read ? '' : ' · Nuevo'}</small></span>
            </button>
          ))}
        </div>
      ) : <Empty title="No tienes notificaciones" text="Te avisaremos cuando recibas mensajes o cambien tus viajes." />}
    </>
  )
}
