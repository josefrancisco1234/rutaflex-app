
import type { Trip } from '../types'

// US12 · Minutos mínimos antes de la salida para cancelar.
export const CANCEL_LIMIT_MINUTES = 15

export function canCancelTrip(t: Trip): boolean {
  const now = new Date()
  const date = t.date || [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('-')

  const departure = new Date(`${date}T${t.time}:00`)

  if (Number.isNaN(departure.getTime())) return false

  const minutesLeft = (departure.getTime() - now.getTime()) / 60000

  return t.status === 'Activo' &&
    minutesLeft > CANCEL_LIMIT_MINUTES
}
