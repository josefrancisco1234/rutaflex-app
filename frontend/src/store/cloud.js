import { useSyncExternalStore } from 'react'
import { supabase, cloudConfigured } from '../lib/supabase'
import { getDb, replaceDb, onSave, setTabSync } from './db'
import { seed } from '../data/seed'

// ---------- estado de conexión ('local' | 'connecting' | 'online' | 'error') ----------
let status = cloudConfigured ? 'connecting' : 'local'
const statusListeners = new Set()
function setStatus(s) { status = s; statusListeners.forEach(l => l()) }
export const cloudReady = () => status === 'online'
export function useCloudStatus() {
  return useSyncExternalStore(fn => { statusListeners.add(fn); return () => statusListeners.delete(fn) }, () => status)
}

// ---------- conversión app ⇄ filas de la base de datos ----------
const TRIP_COLS = ['id', 'driver', 'origin', 'dest', 'time', 'seats', 'price', 'status', 'members', 'stops', 'taxi', 'date']
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

// JSON con claves ordenadas: permite comparar lo local con lo que llega de la base.
const stable = v => Array.isArray(v) ? '[' + v.map(stable).join(',') + ']'
  : v && typeof v === 'object' ? '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}'
  : JSON.stringify(v ?? null)

const userP = u => ({ id: u.id, role: u.role, name: u.name, email: u.email, car: u.car ?? null, scores: u.scores || [], completed: u.completed || 0 })
const tripP = t => {
  const extra = {}
  for (const k in t) if (!TRIP_COLS.includes(k) && t[k] !== undefined) extra[k] = t[k]
  return { id: t.id, driver: t.driver, origin: t.origin, dest: t.dest, time: t.time, seats: t.seats, price: t.price ?? null, status: t.status, members: t.members || [], stops: t.stops ?? null, taxi: t.taxi ?? null, date: t.date ?? null, extra }
}
const msgP = (tripId, m) => ({ id: m.id, trip: tripId, sender: m.sender, text: m.text, time: m.time })
const rateP = r => ({ id: r.id, trip: r.trip, from: r.from, to: r.to, score: r.score })

const fromUser = r => {
  const u = { id: r.id, role: r.rol, name: r.nombre, email: r.email, scores: r.puntuaciones || [], completed: r.viajes_completados || 0 }
  if (r.vehiculo != null) u.car = r.vehiculo
  return u
}
const fromTrip = r => {
  const t = { ...(r.extra || {}), id: r.id, driver: r.conductor_id, origin: r.origen, dest: r.destino, time: r.hora, seats: r.asientos, price: r.precio, status: r.estado, members: r.miembros || [] }
  if (r.paradas != null) t.stops = r.paradas
  if (r.taxi != null) t.taxi = r.taxi
  if (r.fecha != null) t.date = r.fecha
  return t
}
const fromMsg = r => ({ id: r.id, sender: r.remitente_id, text: r.texto, time: r.hora })
const fromRate = r => ({ id: r.id, trip: r.viaje_id, from: r.de_id, to: r.para_id, score: r.puntuacion })

// Lista todas las entidades con su clave y su JSON canónico.
function entries(db) {
  const out = []
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
const group = list => {
  const g = { users: [], trips: [], messages: [], ratings: [] }
  list.forEach(e => g[e.kind].push(e.payload))
  return g
}

// last: último JSON sincronizado por clave. recent: lo que enviamos hace poco (para ignorar nuestro propio eco).
const last = new Map()
const recent = new Map()
function remember(key, json) {
  last.set(key, json)
  const a = recent.get(key) || []
  a.push(json)
  if (a.length > 8) a.shift()
  recent.set(key, a)
}

// ---------- subida de cambios (debounce 400 ms) ----------
let timer = null, busy = false, again = false
function schedule() { if (!timer) timer = setTimeout(flush, 400) }
async function flush() {
  timer = null
  if (busy) { again = true; return }
  const changed = entries(getDb()).filter(e => last.get(e.key) !== e.json)
  if (!changed.length) return
  busy = true
  changed.forEach(e => remember(e.key, e.json))
  const { error } = await supabase.rpc('rf_sync', { p: group(changed) })
  if (error) { console.error('[supabase] rf_sync', error); changed.forEach(e => last.delete(e.key)); setStatus('error') }
  else if (status !== 'online') setStatus('online')
  busy = false
  if (again) { again = false; schedule() }
}

// ---------- descarga ----------
async function fetchAll() {
  const q = (table, order) => supabase.from(table).select('*').order(order)
  const [u, t, m, r] = await Promise.all([q('usuarios', 'seq'), q('viajes', 'seq'), q('mensajes', 'seq'), q('calificaciones', 'seq')])
  const err = u.error || t.error || m.error || r.error
  if (err) throw err
  if (!u.data.length) return null
  const db = { users: u.data.map(fromUser), trips: t.data.map(fromTrip), messages: {}, ratings: r.data.map(fromRate) }
  m.data.forEach(row => (db.messages[row.viaje_id] ??= []).push(fromMsg(row)))
  return db
}
function adopt(db) {
  last.clear(); recent.clear()
  entries(db).forEach(e => remember(e.key, e.json))
  replaceDb(db)
}
let reloadTimer = null
function reload() {
  clearTimeout(reloadTimer)
  reloadTimer = setTimeout(async () => { try { const d = await fetchAll(); if (d) adopt(d) } catch (e) { console.error(e) } }, 300)
}

// ---------- tiempo real ----------
function onChange(ev) {
  if (ev.table === 'rf_meta') return reload()
  if (ev.eventType === 'DELETE' || !ev.new) return
  const db = getDb(), r = ev.new
  let key, json, apply
  if (ev.table === 'usuarios') {
    const u = fromUser(r); key = 'u:' + u.id; json = stable(userP(u))
    apply = () => { const i = db.users.findIndex(x => x.id === u.id); if (i >= 0) db.users[i] = { ...u, pass: db.users[i].pass }; else db.users.push(u) }
  } else if (ev.table === 'viajes') {
    const t = fromTrip(r); key = 't:' + t.id; json = stable(tripP(t))
    apply = () => { const i = db.trips.findIndex(x => x.id === t.id); if (i >= 0) db.trips[i] = t; else db.trips.push(t) }
  } else if (ev.table === 'mensajes') {
    const m = fromMsg(r); key = 'm:' + m.id; json = stable(msgP(r.viaje_id, m))
    apply = () => { const list = (db.messages[r.viaje_id] ??= []); const i = list.findIndex(x => x.id === m.id); if (i >= 0) list[i] = m; else list.push(m) }
  } else if (ev.table === 'calificaciones') {
    const x = fromRate(r); key = 'r:' + x.id; json = stable(rateP(x))
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
    supabase.channel('rutaflex')
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
  const { error } = await supabase.rpc('rf_reset', { p: group(entries(s)) })
  if (error) throw error
  adopt((await fetchAll()) || s)
}

export async function cloudLogin(email, pass) {
  const { data, error } = await supabase.rpc('rf_login', { p_email: email, p_pass: pass })
  if (error) throw error
  return data
}
