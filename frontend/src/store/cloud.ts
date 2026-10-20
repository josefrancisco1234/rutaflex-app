import { useSyncExternalStore } from 'react'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { supabase, cloudConfigured } from '../lib/supabase'
import { getDb, replaceDb, onSave, setTabSync } from './db'
import { seed } from '../data/seed'
import type { Db, Message, Rating, Role, Trip, TripStatus, User } from '../types'

// ---------- estado de conexión ----------
export type CloudStatus = 'local' | 'connecting' | 'online' | 'error'
let status: CloudStatus = cloudConfigured ? 'connecting' : 'local'
const statusListeners = new Set<() => void>()
function setStatus(s: CloudStatus) { status = s; statusListeners.forEach(l => l()) }
export const cloudReady = () => status === 'online'
export function useCloudStatus() {
  return useSyncExternalStore(fn => { statusListeners.add(fn); return () => statusListeners.delete(fn) }, () => status)
}

// Solo se llama cuando hay .env (cloudConfigured); si no, es un error de programación.
function client() {
  if (!supabase) throw new Error('Supabase no está configurado')
  return supabase
}

// ---------- filas de la base de datos (columnas de schema.sql) ----------
type UserRow = { id: string, rol: Role, nombre: string, email: string, vehiculo: string | null, puntuaciones: number[] | null, viajes_completados: number | null }
type TripRow = {
  id: string, conductor_id: string, origen: string, destino: string, hora: string, asientos: number, precio: number | null,
  estado: TripStatus, miembros: string[] | null, paradas: string[] | null, taxi: number | null, fecha: string | null, extra: Partial<Trip> | null
}
type MessageRow = { id: string, viaje_id: string, remitente_id: string, texto: string, hora: string }
type RatingRow = { id: string, viaje_id: string, de_id: string, para_id: string, puntuacion: number }

// ---------- conversión app ⇄ filas de la base de datos ----------
const TRIP_COLS: string[] = ['id', 'driver', 'origin', 'dest', 'time', 'seats', 'price', 'status', 'members', 'stops', 'taxi', 'date']
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

const userP = (u: User) => ({ id: u.id, role: u.role, name: u.name, email: u.email, car: u.car ?? null, scores: u.scores || [], completed: u.completed || 0 })
const tripP = (t: Trip) => {
  const extra: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(t)) if (!TRIP_COLS.includes(k) && v !== undefined) extra[k] = v
  return { id: t.id, driver: t.driver, origin: t.origin, dest: t.dest, time: t.time, seats: t.seats, price: t.price ?? null, status: t.status, members: t.members || [], stops: t.stops ?? null, taxi: t.taxi ?? null, date: t.date ?? null, extra }
}
const msgP = (tripId: string, m: Message) => ({ id: m.id, trip: tripId, sender: m.sender, text: m.text, time: m.time })
const rateP = (r: Rating) => ({ id: r.id, trip: r.trip, from: r.from, to: r.to, score: r.score })

const fromUser = (r: UserRow) => {
  const u: User = { id: r.id, role: r.rol, name: r.nombre, email: r.email, scores: r.puntuaciones || [], completed: r.viajes_completados || 0 }
  if (r.vehiculo != null) u.car = r.vehiculo
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

// Lista todas las entidades con su clave y su JSON canónico.
type Kind = 'users' | 'trips' | 'messages' | 'ratings'
interface Entry { key: string, kind: Kind, json: string, payload: object }

function entries(db: Db) {
  const out: Entry[] = []
  db.users.forEach(u => {
    const p = userP(u)
    out.push({ key: 'u:' + u.id, kind: 'users', json: stable(p), payload: u.pass ? { ...p, pass: u.pass } : p })
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
  return out
}
const group = (list: Entry[]) => {
  const g: Record<Kind, object[]> = { users: [], trips: [], messages: [], ratings: [] }
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
  const { error } = await client().rpc('rf_sync', { p: group(changed) })
  if (error) { console.error('[supabase] rf_sync', error); changed.forEach(e => last.delete(e.key)); setStatus('error') }
  else if (status !== 'online') setStatus('online')
  busy = false
  if (again) { again = false; schedule() }
}

// ---------- descarga ----------
async function rows<T>(table: string) {
  const { data, error } = await client().from(table).select('*').order('seq')
  if (error) throw error
  return data as T[]
}
async function fetchAll() {
  const [u, t, m, r] = await Promise.all([rows<UserRow>('usuarios'), rows<TripRow>('viajes'), rows<MessageRow>('mensajes'), rows<RatingRow>('calificaciones')])
  if (!u.length) return null
  const db: Db = { users: u.map(fromUser), trips: t.map(fromTrip), messages: {}, ratings: r.map(fromRate) }
  m.forEach(row => (db.messages[row.viaje_id] ??= []).push(fromMsg(row)))
  return db
}
function adopt(db: Db) {
  last.clear(); recent.clear()
  entries(db).forEach(e => remember(e.key, e.json))
  replaceDb(db)
}
let reloadTimer: ReturnType<typeof setTimeout> | undefined
function reload() {
  clearTimeout(reloadTimer)
  reloadTimer = setTimeout(async () => { try { const d = await fetchAll(); if (d) adopt(d) } catch (e) { console.error(e) } }, 300)
}

// ---------- tiempo real ----------
function onChange(ev: RealtimePostgresChangesPayload<Record<string, unknown>>) {
  if (ev.table === 'rf_meta') return reload()
  if (ev.eventType === 'DELETE' || !ev.new) return
  const db = getDb(), r = ev.new
  let key: string, json: string, apply: () => void
  if (ev.table === 'usuarios') {
    const u = fromUser(r as UserRow); key = 'u:' + u.id; json = stable(userP(u))
    apply = () => { const i = db.users.findIndex(x => x.id === u.id); if (i >= 0) db.users[i] = { ...u, pass: db.users[i].pass }; else db.users.push(u) }
  } else if (ev.table === 'viajes') {
    const t = fromTrip(r as TripRow); key = 't:' + t.id; json = stable(tripP(t))
    apply = () => { const i = db.trips.findIndex(x => x.id === t.id); if (i >= 0) db.trips[i] = t; else db.trips.push(t) }
  } else if (ev.table === 'mensajes') {
    const row = r as MessageRow, m = fromMsg(row); key = 'm:' + m.id; json = stable(msgP(row.viaje_id, m))
    apply = () => { const list = (db.messages[row.viaje_id] ??= []); const i = list.findIndex(x => x.id === m.id); if (i >= 0) list[i] = m; else list.push(m) }
  } else if (ev.table === 'calificaciones') {
    const x = fromRate(r as RatingRow); key = 'r:' + x.id; json = stable(rateP(x))
    apply = () => { db.ratings ??= []; if (!db.ratings.some(y => y.id === x.id)) db.ratings.push(x) }
  } else return
  if ((recent.get(key) || []).includes(json)) return
  remember(key, json)
  apply()
  replaceDb(db)
}

// ---------- API pública ----------
export async function initCloud() {
  if (!cloudConfigured) return
  setTabSync(false)
  try {
    const d = await fetchAll()
    if (d) adopt(d)
    else await resetCloud()
    onSave(schedule)
    client().channel('rutaflex')
      .on('postgres_changes', { event: '*', schema: 'public' }, onChange)
      .subscribe()
    setStatus('online')
  } catch (e) {
    console.error('[supabase] sin conexión, se usa modo local:', e)
    setTabSync(true)
    setStatus('error')
  }
}

export async function resetCloud() {
  const s = seed()
  const { error } = await client().rpc('rf_reset', { p: group(entries(s)) })
  if (error) throw error
  adopt((await fetchAll()) || s)
}

// Devuelve el id del usuario si correo + contraseña son correctos; si no, null.
export async function cloudLogin(email: string, pass: string) {
  const { data, error } = await client().rpc('rf_login', { p_email: email, p_pass: pass })
  if (error) throw error
  return data as string | null
}
