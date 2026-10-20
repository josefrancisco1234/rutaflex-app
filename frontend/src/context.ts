import { createContext, useContext } from 'react'
import type { Db, PendingUser, User } from './types'

export type ViewKey =
  | 'login' | 'register' | 'otp' | 'guide'
  | 'home' | 'mytrips' | 'detail'
  | 'dhome' | 'publish' | 'trip'
  | 'chats' | 'chat' | 'history' | 'savings' | 'earnings' | 'profile'

// Resumen que muestra EndTripModal al terminar un viaje.
export interface EndSummary {
  dest: string
  dist: number
  mins: number | null
  ps: number
  income: number
}

export type Modal =
  | { type: 'rating'; tripId: string; target: string }
  | ({ type: 'end' } & EndSummary)

export interface AppContextValue {
  db: Db
  current: string | null       // id del usuario logueado
  me: User | null
  isDriver: boolean
  view: ViewKey
  selected: string             // id del viaje seleccionado
  go: (v: ViewKey, id?: string) => void
  toast: (text: string) => void
  rate: (id: string) => void
  login: (id: string) => void
  logout: () => void
  setCurrent: (id: string | null) => void
  resetSession: () => void
  query: string
  setQuery: (q: string) => void
  searched: boolean
  setSearched: (on: boolean) => void
  pending: PendingUser | null
  setPending: (p: PendingUser | null) => void
  otpExpired: boolean
  setOtpExpired: (on: boolean) => void
  setModal: (m: Modal | null) => void
  closeModal: () => void
  homeView: ViewKey
}

// Estado de sesión y navegación compartido por todas las vistas (lo provee App.tsx).
export const AppCtx = createContext<AppContextValue | null>(null)

export function useApp() {
  const ctx = useContext(AppCtx)
  if (!ctx) throw new Error('useApp debe usarse dentro de AppCtx.Provider')
  return ctx
}

// Para vistas que requieren sesión. App.tsx manda a login si no hay usuario,
// así que dentro de esas vistas me y current siempre existen.
export function useSession() {
  const ctx = useApp()
  const { me, current } = ctx
  if (!me || !current) throw new Error('Esta vista requiere una sesión iniciada')
  return { ...ctx, me, current }
}
