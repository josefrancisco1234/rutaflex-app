import { useSyncExternalStore } from 'react'
import { apiUrl, cloudConfigured, demoMode } from '../lib/api'
import { getDb, replaceDb, onSave, setTabSync } from './db'
import { seed } from '../data/seed'
import type { Db, DriverStatus, Message, Notice, NoticeKind, Rating, Role, Trip, TripStatus, User } from '../types'

// ---------- estado de conexión ----------
export type CloudStatus = 'local' | 'connecting' | 'online' | 'error'
let status: CloudStatus = cloudConfigured ? 'connecting' : 'local'
const statusListeners = new Set<() => void>()
function setStatus(s: CloudStatus) { status = s; statusListeners.forEach(l => l()) }
export const cloudReady = () => status === 'online'
export function useCloudStatus() {
  return useSyncExternalStore(fn => { statusListeners.add(fn); return () => statusListeners.delete(fn) }, () => status)
}

// ---------- sesión ----------
// /api/login devuelve un token; cada petición lo envía en Authorization y el servidor
// identifica al usuario con él (nunca con un id que mande el cliente).
const TOKEN_KEY = 'rf-token'
let token: string | null = (() => { try { return sessionStorage.getItem(TOKEN_KEY) } catch { return null } })()
function setToken(t: string | null) {
  token = t
  try { t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY) } catch {}
}
export const hasSession = () => token !== null
// La app escucha este evento para volver al login cuando el servidor rechaza la sesión (vencida o suspendida).
export const SESSION_EXPIRED = 'rf-session-expired'

// Todos los endpoints del backend PHP son POST con cuerpo JSON: <apiUrl>/data | sync | login | register | reset…
async function post<T = null>(endpoint: string, body: object): Promise<{ data: T | null, error: unknown }> {
  try {
    if (!apiUrl) throw new Error('El backend no está configurado')
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = 'Bearer ' + token
    const res = await fetch(`${apiUrl}/${endpoint}`, { method: 'POST', headers, body: JSON.stringify(body) })
    const text = await res.text()
    const data = text ? JSON.parse(text) : null
    if (res.status === 401 && token) {
      setToken(null)
      window.dispatchEvent(new Event(SESSION_EXPIRED))
    }
    return res.ok ? { data, error: null } : { data: null, error: data ?? res.statusText }
  } catch (error) {
    return { data: null, error }
  }
}

// ---------- filas de la base de datos (columnas de backend/schema.sql) ----------
type UserRow = {
  id: string, rol: Role, nombre: string, email: string, vehiculo: string | null, puntuaciones: number[] | null, viajes_completados: number | null, verificado: boolean | null, extra: Partial<User> | null,
  estado_conductor: DriverStatus | null, motivo_rechazo: string | null, baneado: boolean | null, motivo_baneo: string | null, creado_en: string | null
}
type TripRow = {
  id: string, conductor_id: string, origen: string, destino: string, hora: string, asientos: number, precio: number | null,
  estado: TripStatus, miembros: string[] | null, paradas: string[] | null, taxi: number | null, fecha: string | null, extra: Partial<Trip> | null
}
type MessageRow = { id: string, viaje_id: string, remitente_id: string, texto: string, hora: string }
type RatingRow = { id: string, viaje_id: string, de_id: string, para_id: string, puntuacion: number }
type NoticeRow = { id: string, usuario_id: string, tipo: NoticeKind, texto: string, viaje_id: string | null, leida: boolean, creado_en: string }

// ---------- conversión app ⇄ filas de la base de datos ----------
const TRIP_COLS: string[] = ['id', 'driver', 'origin', 'dest', 'time', 'seats', 'price', 'status', 'members', 'stops', 'taxi', 'date']
// driverStatus, rejectReason, banned y banReason son columnas propias; createdAt la pone el servidor.
const USER_COLS: string[] = ['id', 'role', 'name', 'email', 'pass', 'car', 'scores', 'completed', 'verified', 'driverStatus', 'rejectReason', 'banned', 'banReason', 'createdAt']
const uid = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

// JSON con claves ordenadas: permite comparar lo local con lo que llega de la base.
function stable(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']'
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return '{' + Object.keys(o).filter(k => o[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + stable(o[k])).join(',') + '}'
  }
  return JSON.stringify(v ?? null)
}

const userP = (u: User) => {
  const extra: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(u)) if (!USER_COLS.includes(k) && v !== undefined) extra[k] = v
  return {
    id: u.id, role: u.role, name: u.name, email: u.email, car: u.car ?? null, scores: u.scores || [], completed: u.completed || 0, verified: !!u.verified, extra,
    // El servidor solo acepta estos campos al reiniciar la demo; desde /sync los cambia únicamente un admin.
    driverStatus: u.driverStatus ?? null, rejectReason: u.rejectReason ?? null, banned: !!u.banned, banReason: u.banReason ?? null,
  }
}
const tripP = (t: Trip) => {
  const extra: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(t)) if (!TRIP_COLS.includes(k) && v !== undefined) extra[k] = v
  return { id: t.id, driver: t.driver, origin: t.origin, dest: t.dest, time: t.time, seats: t.seats, price: t.price ?? null, status: t.status, members: t.members || [], stops: t.stops ?? null, taxi: t.taxi ?? null, date: t.date ?? null, extra }
}
const msgP = (tripId: string, m: Message) => ({ id: m.id, trip: tripId, sender: m.sender, text: m.text, time: m.time })
const rateP = (r: Rating) => ({ id: r.id, trip: r.trip, from: r.from, to: r.to, score: r.score })
const noticeP = (n: Notice) => ({ id: n.id, to: n.to, kind: n.kind, text: n.text, trip: n.trip ?? null, at: n.at, read: n.read })

const fromUser = (r: UserRow) => {
  const u: User = { ...(r.extra || {}), id: r.id, role: r.rol, name: r.nombre, email: r.email, scores: r.puntuaciones || [], completed: r.viajes_completados || 0 }
  if (r.vehiculo != null) u.car = r.vehiculo
  if (r.verificado) u.verified = true
  if (r.estado_conductor) u.driverStatus = r.estado_conductor
  if (r.motivo_rechazo) u.rejectReason = r.motivo_rechazo
  if (r.baneado) u.banned = true
  if (r.motivo_baneo) u.banReason = r.motivo_baneo
  if (r.creado_en) u.createdAt = r.creado_en
  return u
}
const fromTrip = (r: TripRow) => {
  const t: Trip = { ...(r.extra || {}), id: r.id, driver: r.conductor_id, origin: r.origen, dest: r.destino, time: r.hora, seats: r.asientos, price: r.precio, status: r.estado, members: r.miembros || [] }
  if (r.paradas != null) t.stops = r.paradas
  if (r.taxi != null) t.taxi = r.taxi
  if (r.fecha != null) t.date = r.fecha
  return t
}
const fromMsg = (r: MessageRow): Message => ({ id: r.id, sender: r.remitente_id, text: r.texto, time: r.hora })
const fromRate = (r: RatingRow): Rating => ({ id: r.id, trip: r.viaje_id, from: r.de_id, to: r.para_id, score: r.puntuacion })
const fromNotice = (r: NoticeRow): Notice => {
  const n: Notice = { id: r.id, to: r.usuario_id, kind: r.tipo, text: r.texto, at: r.creado_en, read: r.leida }
  if (r.viaje_id != null) n.trip = r.viaje_id
  return n
}

// Lista todas las entidades con su clave y su JSON canónico.
type Kind = 'users' | 'trips' | 'messages' | 'ratings' | 'notices'
interface Entry { key: string, kind: Kind, json: string, payload: object }

// withPass: solo al reiniciar la demo se envían las contraseñas de los perfiles ficticios.
// En la sincronización normal nunca viaja una contraseña (el servidor además las ignora).
function entries(db: Db, withPass = false) {
  const out: Entry[] = []
  db.users.forEach(u => {
    const p = userP(u)
    out.push({ key: 'u:' + u.id, kind: 'users', json: stable(p), payload: withPass && u.pass ? { ...p, pass: u.pass } : p })
  })
  db.trips.forEach(t => {
    const p = tripP(t)
    out.push({ key: 't:' + t.id, kind: 'trips', json: stable(p), payload: p })
  })
  Object.entries(db.messages || {}).forEach(([tripId, list]) => list.forEach(m => {
    if (!m.id) m.id = uid('m')
    const p = msgP(tripId, m)
    out.push({ key: 'm:' + m.id, kind: 'messages', json: stable(p), payload: p })
  }))
  ;(db.ratings || []).forEach(r => {
    if (!r.id) r.id = uid('r')
    const p = rateP(r)
    out.push({ key: 'r:' + r.id, kind: 'ratings', json: stable(p), payload: p })
  })
  ;(db.notices || []).forEach(n => {
    const p = noticeP(n)
    out.push({ key: 'n:' + n.id, kind: 'notices', json: stable(p), payload: p })
  })
  return out
}
const group = (list: Entry[]) => {
  const g: Record<Kind, object[]> = { users: [], trips: [], messages: [], ratings: [], notices: [] }
  list.forEach(e => g[e.kind].push(e.payload))
  return g
}

// last: último JSON sincronizado por clave. recent: lo que enviamos hace poco (para ignorar nuestro propio eco).
const last = new Map<string, string>()
const recent = new Map<string, string[]>()
function remember(key: string, json: string) {
  last.set(key, json)
  const a = recent.get(key) || []
  a.push(json)
  if (a.length > 8) a.shift()
  recent.set(key, a)
}

// ---------- subida de cambios (debounce 400 ms) ----------
let timer: ReturnType<typeof setTimeout> | null = null, busy = false, again = false
function schedule() { if (!timer) timer = setTimeout(flush, 400) }
async function flush() {
  timer = null
  if (busy) { again = true; return }
  const changed = entries(getDb()).filter(e => last.get(e.key) !== e.json)
  if (!changed.length) return
  busy = true
  changed.forEach(e => remember(e.key, e.json))
  const { error } = await post('sync', { p: group(changed) })
  if (error) { console.error('[backend] sync', error); changed.forEach(e => last.delete(e.key)); setStatus('error') }
  else if (status !== 'online') setStatus('online')
  busy = false
  if (again) { again = false; schedule() }
}

// ---------- descarga ----------
interface Snapshot { version: number, usuarios: UserRow[], viajes: TripRow[], mensajes: MessageRow[], calificaciones: RatingRow[], notificaciones?: NoticeRow[] }
let lastHash = '', knownVersion = -1

// POST /data. Con el hash de lo último recibido, el servidor responde unchanged si nada cambió.
async function fetchSnapshot(useHash: boolean): Promise<Snapshot | null> {
  const { data, error } = await post<Snapshot & { hash?: string, unchanged?: boolean }>('data', useHash && lastHash ? { hash: lastHash } : {})
  if (error) throw error
  if (!data || data.unchanged) return null
  lastHash = data.hash || ''
  return data
}
function toDb(s: Snapshot) {
  if (demoMode && !s.usuarios.length) return null   // modo exposición: base vacía → se carga la demo
  const db: Db = { users: s.usuarios.map(fromUser), trips: s.viajes.map(fromTrip), messages: {}, ratings: s.calificaciones.map(fromRate), notices: (s.notificaciones || []).map(fromNotice) }
  s.mensajes.forEach(row => (db.messages[row.viaje_id] ??= []).push(fromMsg(row)))
  return db
}
async function fetchAll() {
  const s = await fetchSnapshot(false)
  if (!s) return null
  knownVersion = s.version
  return toDb(s)
}
function adopt(db: Db) {
  last.clear(); recent.clear()
  entries(db).forEach(e => remember(e.key, e.json))
  replaceDb(db)
}

// ---------- sincronización en vivo (sondeo con POST /data cada 1,5 s) ----------
// Aplica una fila recibida; devuelve true si cambió algo local.
function applyRow(table: 'usuarios' | 'viajes' | 'mensajes' | 'calificaciones' | 'notificaciones', r: UserRow | TripRow | MessageRow | RatingRow | NoticeRow): boolean {
  const db = getDb()
  let key: string, json: string, apply: () => void
  if (table === 'usuarios') {
    const u = fromUser(r as UserRow); key = 'u:' + u.id; json = stable(userP(u))
    apply = () => { const i = db.users.findIndex(x => x.id === u.id); if (i >= 0) db.users[i] = { ...u, pass: db.users[i].pass }; else db.users.push(u) }
  } else if (table === 'viajes') {
    const t = fromTrip(r as TripRow); key = 't:' + t.id; json = stable(tripP(t))
    apply = () => { const i = db.trips.findIndex(x => x.id === t.id); if (i >= 0) db.trips[i] = t; else db.trips.push(t) }
  } else if (table === 'mensajes') {
    const row = r as MessageRow, m = fromMsg(row); key = 'm:' + m.id; json = stable(msgP(row.viaje_id, m))
    apply = () => { const list = (db.messages[row.viaje_id] ??= []); const i = list.findIndex(x => x.id === m.id); if (i >= 0) list[i] = m; else list.push(m) }
  } else if (table === 'notificaciones') {
    const x = fromNotice(r as NoticeRow); key = 'n:' + x.id; json = stable(noticeP(x))
    apply = () => { db.notices ??= []; const i = db.notices.findIndex(y => y.id === x.id); if (i >= 0) db.notices[i] = x; else db.notices.push(x) }
  } else {
    const x = fromRate(r as RatingRow); key = 'r:' + x.id; json = stable(rateP(x))
    apply = () => { db.ratings ??= []; if (!db.ratings.some(y => y.id === x.id)) db.ratings.push(x) }
  }
  // Ignora lo que ya tenemos sincronizado y nuestro propio eco.
  if (last.get(key) === json || (recent.get(key) || []).includes(json)) return false
  remember(key, json)
  apply()
  return true
}

let polling = false
async function poll() {
  if (polling || document.hidden || busy || timer) return
  polling = true
  try {
    const s = await fetchSnapshot(true)
    if (!s) return
    if (s.version !== knownVersion) {            // demo reiniciada: recarga completa
      knownVersion = s.version
      const d = toDb(s)
      if (d) adopt(d)
      return
    }
    let changed = false
    s.usuarios.forEach(r => { changed = applyRow('usuarios', r) || changed })
    s.viajes.forEach(r => { changed = applyRow('viajes', r) || changed })
    s.mensajes.forEach(r => { changed = applyRow('mensajes', r) || changed })
    s.calificaciones.forEach(r => { changed = applyRow('calificaciones', r) || changed })
    ;(s.notificaciones || []).forEach(r => { changed = applyRow('notificaciones', r) || changed })
    if (changed) replaceDb(getDb())
  } catch (e) { console.error('[backend] sondeo', e) }
  finally { polling = false }
}

// Pide los datos al servidor de inmediato (tras una acción de admin, sin esperar al próximo sondeo).
export const refreshCloud = () => poll()

// ---------- API pública ----------
export async function initCloud() {
  if (!cloudConfigured) return
  setTabSync(false)
  try {
    const d = await fetchAll()
    if (d) adopt(d)
    else await resetCloud()
    onSave(schedule)
    setInterval(poll, 1500)
    setStatus('online')
  } catch (e) {
    console.error('[backend] sin conexión, se usa modo local:', e)
    setTabSync(true)
    setStatus('error')
  }
}

export async function resetCloud() {
  if (!demoMode) throw new Error('Reiniciar solo está disponible en modo exposición')
  const s = seed()
  const { error } = await post('reset', { p: group(entries(s, true)) })
  if (error) throw error
  adopt((await fetchAll()) || s)
}

// Recarga los datos con la sesión actual: al entrar aparecen los chats y avisos propios,
// y al salir se quitan del navegador los datos privados del usuario anterior.
async function reloadCloud() {
  if (!cloudReady()) return
  lastHash = ''
  try { const d = await fetchAll(); if (d) adopt(d) } catch (e) { console.error('[backend] recarga', e) }
}

// Devuelve el id del usuario si correo + contraseña son correctos (y guarda el token); si no, null.
export async function cloudLogin(email: string, pass: string) {
  const { data, error } = await post<{ id: string, token: string }>('login', { email, pass })
  if (error) throw error
  if (!data) return null
  setToken(data.token)
  await reloadCloud()
  return data.id
}

// US02 · El servidor crea la cuenta (valida dominio, cifra la contraseña, conductor queda pendiente).
export async function cloudRegister(p: { name: string, email: string, pass: string, role: Role, phone?: string, application?: object }) {
  const { error } = await post('register', { p })
  if (!error) return null
  const msg = error as { error?: string, message?: string }
  return msg?.error || msg?.message || 'No se pudo conectar con el servidor.'
}

// US03 · Invalida el token en el servidor y borra la sesión del navegador.
export async function cloudLogout(userId: string) {
  if (token && cloudReady()) await post('logout', { user: userId })
  clearSession()
}
export function clearSession() {
  if (!token) return
  setToken(null)
  void reloadCloud()
}

// ---------- Endpoints del Release 2 ----------
// Con el backend en línea, la acción se valida primero en el servidor (que además crea los avisos);
// sin backend devuelve { ok: true, cloud: false } y la vista aplica la regla en modo local.
export type ApiResult = { ok: boolean, cloud: boolean, error?: string }
async function api(fn: string, body: object): Promise<ApiResult> {
  if (!cloudReady()) return { ok: true, cloud: false }
  const { error } = await post(fn, body)
  if (!error) return { ok: true, cloud: true }
  console.error('[backend] ' + fn, error)
  const msg = (error as { error?: string, message?: string })
  return { ok: false, cloud: true, error: msg?.error || msg?.message || 'No se pudo conectar con el servidor.' }
}

// POST <apiUrl>/<endpoint> (backend/public/index.php · backend/src/Api.php)
export const apiUpdateProfile = (userId: string, p: object) => api('profile', { user: userId, p })
export const apiVerifyIdentity = (userId: string, code: string) => api('verify', { user: userId, code })
export const apiEditTrip = (tripId: string, driverId: string, p: object) => api('edit-trip', { trip: tripId, driver: driverId, p })
export const apiCancelTrip = (tripId: string, driverId: string, reason: string) => api('cancel-trip', { trip: tripId, driver: driverId, reason })
export const apiMarkRead = (userId: string) => api('mark-read', { user: userId })

// ---------- Administración ----------
export const apiDriverApply = (userId: string, p: object) => api('driver-apply', { user: userId, p })
export const apiAdminReview = (adminId: string, userId: string, approve: boolean, reason?: string) => api('admin-review', { admin: adminId, user: userId, approve, reason })
export const apiAdminBan = (adminId: string, userId: string, ban: boolean, reason?: string) => api('admin-ban', { admin: adminId, user: userId, ban, reason })
export const apiAdminDelete = (adminId: string, userId: string) => api('admin-delete', { admin: adminId, user: userId })
