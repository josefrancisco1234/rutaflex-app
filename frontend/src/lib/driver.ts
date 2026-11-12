import type { DriverApplication, User } from '../types'
import type { FormErrors } from './utils'

const today = () => new Date().toISOString().slice(0, 10)

// Placa peruana: 3 caracteres, guion y 3 dígitos (se acepta sin guion).
export function normPlate(s: string) {
  const p = s.toUpperCase().replace(/\s+/g, '')
  const m = /^([A-Z0-9]{3})(\d{3})$/.exec(p)
  return m ? m[1] + '-' + m[2] : p
}

// Valida el formulario de solicitud de conductor (mismas reglas que POST /api/driver-apply).
export function readApplication(f: FormData) {
  const v = (k: string) => String(f.get(k) || '').trim()
  const app: DriverApplication = { model: v('model'), plate: normPlate(v('plate')), license: v('license').toUpperCase(), soat: v('soat'), submittedAt: today() }
  const phone = v('phone')
  const er: FormErrors = {}
  if (app.model.length < 3 || app.model.length > 60) er.model = 'Describe tu vehículo: marca, modelo y color.'
  if (!/^[A-Z0-9]{3}-\d{3}$/.test(app.plate)) er.plate = 'Ingresa la placa con el formato ABC-123.'
  if (!/^[A-Z]\d{8}$/.test(app.license)) er.license = 'La licencia tiene una letra y 8 dígitos (ej. Q12345678).'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(app.soat)) er.soat = 'Indica la fecha de vencimiento de tu SOAT.'
  else if (app.soat < today()) er.soat = 'Tu SOAT está vencido. Solo se aceptan vehículos con SOAT vigente.'
  if (!/^9\d{8}$/.test(phone)) er.phone = 'Ingresa un celular de 9 dígitos que empiece con 9.'
  return { app, phone, car: app.model + ' · ' + app.plate, er }
}

// Un conductor solo publica y gestiona viajes cuando un admin aprobó su solicitud.
export const approvedDriver = (u: User | null | undefined) => u?.role === 'conductor' && u.driverStatus === 'aprobado' && !u.banned
