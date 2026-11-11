import { useSyncExternalStore } from 'react'
import { initial } from '../data/seed'
import type { Db, Notice, Trip } from '../types'

// Estado de datos de la app: un objeto `db` que se muta y luego se confirma con save().
// save() guarda en localStorage, re-renderiza React y avisa a la capa del backend.
export const KEY = 'rutaflex-r2'

function load(): Db {
  try { return fix(JSON.parse(localStorage.getItem(KEY) ?? 'null') || initial()) } catch { return initial() }
}
// Datos guardados por versiones anteriores pueden no traer todas las colecciones.
export function fix(d: Db): Db { d.messages ??= {}; d.ratings ??= []; d.notices ??= []; return d }

let db = load()
let version = 0
let tabSync = true
const listeners = new Set<() => void>()
const saveHooks = new Set<() => void>()

const emit = () => { version++; listeners.forEach(l => l()) }
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(db)) } catch {} }

export const getDb = () => db
export function save() { persist(); emit(); saveHooks.forEach(h => h()) }
export function replaceDb(next: Db) { db = fix(next); persist(); emit() }
export function onSave(fn: () => void) { saveHooks.add(fn); return () => saveHooks.delete(fn) }
export function setTabSync(on: boolean) { tabSync = on }

export function useDb() {
  useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn) }, () => version)
  return db
}

export const user = (id: string) => db.users.find(u => u.id === id)
export const trip = (id: string) => db.trips.find(t => t.id === id)
export const passengers = (t: Trip) => t.members.filter(id => id !== t.driver)
export const active = (t: Trip | undefined): t is Trip => !!t && (t.status === 'Activo' || t.status === 'En curso')
export const others = (t: Trip, me: string) => t.members.filter(id => id !== me)

// US15 · US16 · Crea un aviso para cada destinatario (se confirma con save()).
let noticeSeq = 0
export function notify(to: string[], kind: Notice['kind'], text: string, tripId?: string) {
  const at = new Date().toISOString()
  new Set(to).forEach(id => db.notices.push({ id: 'n' + Date.now().toString(36) + (noticeSeq++).toString(36) + Math.random().toString(36).slice(2, 6), to: id, kind, text, trip: tripId, at, read: false }))
}

// Sin backend: sincroniza entre pestañas del mismo navegador.
window.addEventListener('storage', e => {
  if (!tabSync || e.key !== KEY || !e.newValue) return
  try { db = fix(JSON.parse(e.newValue)) } catch { return }
  emit()
})
