import { useCallback, useEffect, useRef, useState } from 'react'
import type { ComponentType } from 'react'
import { AppCtx } from './context'
import type { AppContextValue, Modal, ViewKey } from './context'
import { useDb, user, trip, passengers, getDb, save } from './store/db'
import { useCloudStatus, apiLogout, apiMarkRead } from './store/cloud'
import type { CloudStatus } from './store/cloud'
import { firstName } from './lib/utils'
import { demoMode } from './lib/api'
import { RoleBadge } from './components/ui'
import DemoLab from './components/DemoLab'
import { RatingModal, EndTripModal, CancelTripModal } from './components/Modals'
import { Login, Register, Otp } from './views/Auth'
import { Home, MyTrips, Detail } from './views/Passenger'
import { DriverHome, Publish, EditTrip } from './views/Driver'
import TripView from './views/TripView'
import { Chats, Chat } from './views/Chat'
import { History, Savings, Earnings, ProfileView, Impact } from './views/Account'
import Notices from './views/Notices'
import Guide from './views/Guide'
import { AdminUsers, AdminRequests } from './views/Admin'
import Application from './views/Application'
import { approvedDriver } from './lib/driver'
import type { PendingUser } from './types'

const VIEWS: Record<ViewKey, ComponentType> = {
  login: Login, register: Register, otp: Otp, guide: Guide,
  home: Home, mytrips: MyTrips, detail: Detail,
  dhome: DriverHome, publish: Publish, trip: TripView,
  chats: Chats, chat: Chat, history: History, savings: Savings, earnings: Earnings, profile: ProfileView,
  edittrip: EditTrip, notices: Notices, impact: Impact,
  admin: AdminUsers, requests: AdminRequests, application: Application,
}
const NAV_A: [ViewKey, string][] = [['admin', 'Usuarios'], ['requests', 'Solicitudes de conductor']]
// Conductor cuya solicitud todavía no fue aprobada.
const NAV_PENDING: [ViewKey, string][] = [['application', 'Mi solicitud'], ['profile', 'Perfil']]
const ADMIN_VIEWS: ViewKey[] = ['admin', 'requests', 'notices', 'guide']
const PENDING_VIEWS: ViewKey[] = ['application', 'profile', 'notices', 'guide']
const NAV_P: [ViewKey, string][] = [['home', 'Buscar viajes'], ['mytrips', 'Mis viajes'], ['chats', 'Chat'], ['history', 'Historial'], ['savings', 'Ahorro'], ['impact', 'CO₂'], ['profile', 'Perfil'], ...(demoMode ? [['guide', 'Evidencia'] as [ViewKey, string]] : [])]
const NAV_C: [ViewKey, string][] = [['dhome', 'Panel'], ['publish', 'Publicar ruta'], ['chats', 'Chat'], ['history', 'Historial'], ['earnings', 'Ganancias'], ['impact', 'CO₂'], ['profile', 'Perfil'], ...(demoMode ? [['guide', 'Evidencia'] as [ViewKey, string]] : [])]
const DRIVER_ONLY: ViewKey[] = ['dhome', 'publish', 'earnings', 'edittrip']
const PASSENGER_ONLY: ViewKey[] = ['home', 'mytrips', 'savings', 'detail']
const PUBLIC: ViewKey[] = ['login', 'register', 'otp', 'guide']
const STATUS_TEXT: Record<CloudStatus, string> = { local: '💾 Modo local', connecting: '☁️ Conectando…', online: '☁️ Servidor en línea', error: '⚠️ Sin servidor · modo local' }

const homeFor = (id: string): ViewKey => {
  const u = user(id)
  if (u?.role === 'admin') return 'admin'
  if (u?.role === 'conductor') return approvedDriver(u) ? 'dhome' : 'application'
  return 'home'
}

export default function App() {
  const db = useDb()
  const cloud = useCloudStatus()
  const [current, setCurrentState] = useState<string | null>(() => { try { return sessionStorage.getItem('rf-user') } catch { return null } })
  const [view, setView] = useState<ViewKey>(() => (current && user(current) ? homeFor(current) : 'login'))
  const [selected, setSelected] = useState('t1')
  const [query, setQuery] = useState('')
  const [searched, setSearched] = useState(false)
  const [pending, setPending] = useState<PendingUser | null>(null)
  const [otpExpired, setOtpExpired] = useState(false)
  const [modal, setModal] = useState<Modal | null>(null)
  const [toastText, setToastText] = useState('')
  const toastTimer = useRef<ReturnType<typeof setTimeout>>()

  const me = current ? user(current) ?? null : null
  const isDriver = me?.role === 'conductor'
  const isAdmin = me?.role === 'admin'
  const pendingDriver = isDriver && !approvedDriver(me)

  const setCurrent = useCallback((id: string | null) => {
    setCurrentState(id)
    try { id ? sessionStorage.setItem('rf-user', id) : sessionStorage.removeItem('rf-user') } catch {}
  }, [])
  const toast = useCallback((text: string) => {
    setToastText(text)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastText(''), 3500)
  }, [])
  const go = useCallback((v: ViewKey, id?: string) => {
    if (id) setSelected(id)
    setView(v)
    window.scrollTo(0, 0)
  }, [])
  const closeModal = useCallback(() => setModal(null), [])

  // Si el usuario de la sesión ya no existe (p. ej. tras reiniciar la demo), se cierra la sesión.
  useEffect(() => {
    if (current && !user(current) && cloud !== 'connecting') setCurrent(null)
  }, [db, current, cloud, setCurrent])

  // Cuenta suspendida por un admin mientras estaba en uso: se cierra la sesión.
  const bannedNow = !!me?.banned
  useEffect(() => {
    if (!bannedNow) return
    const reason = me?.banReason
    setCurrent(null)
    resetSession()
    go('login')
    toast('Tu cuenta fue suspendida por un administrador.' + (reason ? ' Motivo: ' + reason : ''))
  }, [bannedNow]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [closeModal])

  function rate(id: string) {
    const t = trip(id)
    if (!t || t.status !== 'Finalizado') return toast('Calificación rechazada: el viaje todavía no ha finalizado.')
    if (!current || !t.members.includes(current)) return toast('Solo puedes calificar viajes en los que participaste.')
    const target = t.driver === current ? passengers(t)[0] : t.driver
    if (!target) return toast('Este viaje no tuvo pasajeros.')
    setSelected(id)
    setModal({ type: 'rating', tripId: id, target })
  }

  function login(id: string) { setCurrent(id); go(homeFor(id)) }
  function resetSession() { setPending(null); setQuery(''); setSearched(false); setModal(null) }
  // US03 · Cerrar sesión: borra la sesión del navegador y bloquea las pantallas protegidas.
  function logout() {
    if (current) apiLogout(current)
    setCurrent(null)
    resetSession()
    setSelected('t1')
    go('login')
    toast('Sesión cerrada. Inicia sesión para volver a entrar.')
  }

  // US15 · US16 · Avisa (toast y notificación del navegador) cuando llega un aviso nuevo.
  const mine = current ? db.notices.filter(n => n.to === current) : []
  const unread = mine.filter(n => !n.read).length
  const seen = useRef<{ user: string, ids: Set<string> } | null>(null)
  useEffect(() => {
    if (!current) { seen.current = null; return }
    const ids = db.notices.filter(n => n.to === current).map(n => n.id)
    // Al entrar no se muestran como nuevos los avisos que ya existían (se ven en la campana).
    if (seen.current?.user !== current) { seen.current = { user: current, ids: new Set(ids) }; return }
    const known = seen.current.ids
    const fresh = db.notices.filter(n => n.to === current && !n.read && !known.has(n.id))
    ids.forEach(id => known.add(id))
    const n = fresh[fresh.length - 1]
    if (!n) return
    // No interrumpir si ya se está leyendo ese chat.
    if (n.kind === 'mensaje' && view === 'chat' && selected === n.trip) return
    toast((n.kind === 'mensaje' ? '💬 ' : n.kind === 'cuenta' ? '🛡️ ' : '🚗 ') + n.text)
    try { if ('Notification' in window && Notification.permission === 'granted' && document.hidden) new Notification('RutaFlex', { body: n.text }) } catch {}
  }, [db, db.notices.length, current, view, selected, toast]) // db se muta en el sitio: el largo detecta avisos nuevos

  function markAllRead() {
    if (!current) return
    let changed = false
    getDb().notices.forEach(n => { if (n.to === current && !n.read) { n.read = true; changed = true } })
    if (changed) { save(); apiMarkRead(current) }
  }

  // Reglas de acceso por rol.
  let v: ViewKey = VIEWS[view] ? view : 'login'
  if (me && current) {
    if (isAdmin) { if (!ADMIN_VIEWS.includes(v)) v = 'admin' }
    else if (v === 'admin' || v === 'requests') v = homeFor(current)
    else if (pendingDriver) { if (!PENDING_VIEWS.includes(v)) v = 'application' }
    else if (v === 'application' && !isDriver) v = 'home'
    else if (isDriver && PASSENGER_ONLY.includes(v)) v = 'dhome'
    else if (!isDriver && DRIVER_ONLY.includes(v)) v = 'home'
  }
  if (!me && !PUBLIC.includes(v)) v = 'login'
  const View = VIEWS[v]

  const ctx: AppContextValue = {
    db, current, me, isDriver, view: v, selected, go, toast, rate, login, logout, setCurrent, resetSession,
    query, setQuery, searched, setSearched, pending, setPending, otpExpired, setOtpExpired,
    setModal, closeModal, homeView: me && current ? homeFor(current) : 'login',
    unread, markAllRead,
  }

  return (
    <AppCtx.Provider value={ctx}>
      <header>
        <div className="brand"><b>RF</b>Ruta<span>Flex</span></div>
        <nav>
          {me
            ? (isAdmin ? NAV_A : pendingDriver ? NAV_PENDING : isDriver ? NAV_C : NAV_P).map(([key, label]) => (
              <button key={key} className={v === key ? 'active' : ''} onClick={() => go(key)}>{label}</button>
            ))
            : demoMode && <button onClick={() => go('guide')}>Guía y trazabilidad</button>}
        </nav>
        <div className="headright">
          <span className="pill" title="Estado del backend">{STATUS_TEXT[cloud]}</span>
          {me && <>
            <RoleBadge role={me.role} />
            <small>{firstName(me.name)}{me.verified && <span className="verified" title="Identidad verificada"> ✔</span>}</small>
            <button className={'bell' + (v === 'notices' ? ' active' : '')} aria-label={'Notificaciones' + (unread ? ': ' + unread + ' sin leer' : '')} onClick={() => go('notices')}>
              🔔{unread > 0 && <span className="badge">{unread > 9 ? '9+' : unread}</span>}
            </button>
            <button className="secondary" onClick={logout}>Cerrar sesión</button>
          </>}
        </div>
      </header>
      <main>
        <View key={v + ':' + selected} />
        {demoMode && <DemoLab />}
      </main>
      {modal?.type === 'rating' && <RatingModal tripId={modal.tripId} target={modal.target} />}
      {modal?.type === 'end' && <EndTripModal {...modal} />}
      {modal?.type === 'cancel' && <CancelTripModal tripId={modal.tripId} />}
      <div className={toastText ? 'toast' : ''} role="status" aria-live="polite">{toastText}</div>
    </AppCtx.Provider>
  )
}
