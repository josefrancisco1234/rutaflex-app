import { useSyncExternalStore } from 'react'
import { seed } from '../data/seed'
import type { Db, Trip } from '../types'

// Estado de datos de la app: un objeto `db` que se muta y luego se confirma con save().
// save() guarda en localStorage, re-renderiza React y avisa a la capa de Supabase.
export const KEY = 'rutaflex-r12'

function load(): Db {
  try { return JSON.parse(localStorage.getItem(KEY) ?? 'null') || seed() } catch { return seed() }
}

let db = load()
let version = 0
let tabSync = true
const listeners = new Set<() => void>()
const saveHooks = new Set<() => void>()

const emit = () => { version++; listeners.forEach(l => l()) }
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(db)) } catch {} }

export const getDb = () => db
export function save() { persist(); emit(); saveHooks.forEach(h => h()) }
export function replaceDb(next: Db) { db = next; persist(); emit() }
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

// Sin Supabase: sincroniza entre pestañas del mismo navegador.
window.addEventListener('storage', e => {
  if (!tabSync || e.key !== KEY || !e.newValue) return
  try { db = JSON.parse(e.newValue) } catch { return }
  emit()
})
