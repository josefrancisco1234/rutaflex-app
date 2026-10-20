import { useSyncExternalStore } from 'react'
import { seed } from '../data/seed'

// Estado de datos de la app: un objeto `db` que se muta y luego se confirma con save().
// save() guarda en localStorage, re-renderiza React y avisa a la capa de Supabase.
export const KEY = 'rutaflex-r12'

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || seed() } catch { return seed() }
}

let db = load()
let version = 0
let tabSync = true
const listeners = new Set()
const saveHooks = new Set()

const emit = () => { version++; listeners.forEach(l => l()) }
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(db)) } catch {} }

export const getDb = () => db
export function save() { persist(); emit(); saveHooks.forEach(h => h()) }
export function replaceDb(next) { db = next; persist(); emit() }
export function onSave(fn) { saveHooks.add(fn); return () => saveHooks.delete(fn) }
export function setTabSync(on) { tabSync = on }

export function useDb() {
  useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn) }, () => version)
  return db
}

export const user = id => db.users.find(u => u.id === id)
export const trip = id => db.trips.find(t => t.id === id)
export const passengers = t => t.members.filter(id => id !== t.driver)
export const active = t => Boolean(t) && (t.status === 'Activo' || t.status === 'En curso')

// Sin Supabase: sincroniza entre pestañas del mismo navegador.
window.addEventListener('storage', e => {
  if (!tabSync || e.key !== KEY || !e.newValue) return
  try { db = JSON.parse(e.newValue) } catch { return }
  emit()
})
