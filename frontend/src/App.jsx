import { useCallback, useEffect, useRef, useState } from 'react'
import { AppCtx } from './context'
import { useDb, user, trip, passengers } from './store/db'
import { useCloudStatus } from './store/cloud'
import { firstName } from './lib/utils'
import { RoleBadge } from './components/ui'
import DemoLab from './components/DemoLab'
import { RatingModal, EndTripModal } from './components/Modals'
import { Login, Register, Otp } from './views/Auth'
import { Home, MyTrips, Detail } from './views/Passenger'
import { DriverHome, Publish } from './views/Driver'
import TripView from './views/TripView'
import { Chats, Chat } from './views/Chat'
import { History, Savings, Earnings, ProfileView } from './views/Account'
import Guide from './views/Guide'

const VIEWS = {
  login: Login, register: Register, otp: Otp, guide: Guide,
  home: Home, mytrips: MyTrips, detail: Detail,
  dhome: DriverHome, publish: Publish, trip: TripView,
  chats: Chats, chat: Chat, history: History, savings: Savings, earnings: Earnings, profile: ProfileView,
}
const NAV_P = [['home', 'Buscar viajes'], ['mytrips', 'Mis viajes'], ['chats', 'Chat'], ['history', 'Historial'], ['savings', 'Ahorro'], ['profile', 'Perfil'], ['guide', 'Evidencia']]
const NAV_C = [['dhome', 'Panel'], ['publish', 'Publicar ruta'], ['chats', 'Chat'], ['history', 'Historial'], ['earnings', 'Ganancias'], ['profile', 'Perfil'], ['guide', 'Evidencia']]
const DRIVER_ONLY = ['dhome', 'publish', 'earnings']
const PASSENGER_ONLY = ['home', 'mytrips', 'savings', 'detail']
const PUBLIC = ['login', 'register', 'otp', 'guide']
const STATUS_TEXT = { local: '💾 Modo local', connecting: '☁️ Conectando…', online: '☁️ Supabase en línea', error: '⚠️ Sin Supabase · modo local' }

const homeFor = id => user(id)?.role === 'conductor' ? 'dhome' : 'home'

export default function App() {
  const db = useDb()
  const cloud = useCloudStatus()
  const [current, setCurrentState] = useState(() => { try { return sessionStorage.getItem('rf-user') } catch { return null } })
  const [view, setView] = useState(() => (current && user(current) ? homeFor(current) : 'login'))
  const [selected, setSelected] = useState('t1')
  const [query, setQuery] = useState('')
  const [searched, setSearched] = useState(false)
  const [pending, setPending] = useState(null)
  const [otpExpired, setOtpExpired] = useState(false)
  const [modal, setModal] = useState(null)
  const [toastText, setToastText] = useState('')
  const toastTimer = useRef(null)

  const me = current ? user(current) : null
  const isDriver = me?.role === 'conductor'

  const setCurrent = useCallback(id => {
    setCurrentState(id)
    try { id ? sessionStorage.setItem('rf-user', id) : sessionStorage.removeItem('rf-user') } catch {}
  }, [])
  const toast = useCallback(text => {
    setToastText(text)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastText(''), 3500)
  }, [])
  const go = useCallback((v, id) => {
    if (id) setSelected(id)
    setView(v)
    window.scrollTo(0, 0)
  }, [])
  const closeModal = useCallback(() => setModal(null), [])

  // Si el usuario de la sesión ya no existe (p. ej. tras reiniciar la demo), se cierra la sesión.
  useEffect(() => {
    if (current && !user(current) && cloud !== 'connecting') setCurrent(null)
  }, [db, current, cloud, setCurrent])

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') closeModal() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [closeModal])

  function rate(id) {
    const t = trip(id)
    if (!t || t.status !== 'Finalizado') return toast('Calificación rechazada: el viaje todavía no ha finalizado.')
    if (!t.members.includes(current)) return toast('Solo puedes calificar viajes en los que participaste.')
    const target = t.driver === current ? passengers(t)[0] : t.driver
    if (!target) return toast('Este viaje no tuvo pasajeros.')
    setSelected(id)
    setModal({ type: 'rating', tripId: id, target })
  }

  function login(id) { setCurrent(id); go(homeFor(id)) }
  function logout() { setCurrent(null); go('login'); toast('Sesión cerrada. Elige otro perfil.') }
  function resetSession() { setPending(null); setQuery(''); setSearched(false); setModal(null) }

  // Reglas de acceso por rol.
  let v = VIEWS[view] ? view : 'login'
  if (me && isDriver && PASSENGER_ONLY.includes(v)) v = 'dhome'
  if (me && !isDriver && DRIVER_ONLY.includes(v)) v = 'home'
  if (!me && !PUBLIC.includes(v)) v = 'login'
  const View = VIEWS[v]

  const ctx = {
    db, current, me, isDriver, view: v, selected, go, toast, rate, login, logout, setCurrent, resetSession,
    query, setQuery, searched, setSearched, pending, setPending, otpExpired, setOtpExpired,
    setModal, closeModal, homeView: me ? homeFor(current) : 'login',
  }

  return (
    <AppCtx.Provider value={ctx}>
      <header>
        <div className="brand"><b>RF</b>Ruta<span>Flex</span></div>
        <nav>
          {me
            ? (isDriver ? NAV_C : NAV_P).map(([key, label]) => (
              <button key={key} className={v === key ? 'active' : ''} onClick={() => go(key)}>{label}</button>
            ))
            : <button onClick={() => go('guide')}>Guía y trazabilidad</button>}
        </nav>
        <div className="headright">
          <span className="pill" title="Estado del backend">{STATUS_TEXT[cloud]}</span>
          {me && <>
            <RoleBadge role={me.role} />
            <small>{firstName(me.name)}</small>
            <button className="secondary" onClick={logout}>Cambiar perfil</button>
          </>}
        </div>
      </header>
      <main>
        <View key={v + ':' + selected} />
        <DemoLab />
      </main>
      {modal?.type === 'rating' && <RatingModal tripId={modal.tripId} target={modal.target} />}
      {modal?.type === 'end' && <EndTripModal {...modal} />}
      <div className={toastText ? 'toast' : ''} role="status" aria-live="polite">{toastText}</div>
    </AppCtx.Provider>
  )
}
