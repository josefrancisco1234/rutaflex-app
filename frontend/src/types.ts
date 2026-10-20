// Modelo de datos de la app. En Supabase cada entidad tiene su tabla (ver backend/supabase/schema.sql).

// Coordenada [latitud, longitud].
export type LatLng = [number, number]

export type Role = 'pasajero' | 'conductor'

export type TripStatus = 'Activo' | 'En curso' | 'Finalizado'

export interface User {
  id: string
  role: Role
  name: string
  email: string
  pass?: string          // solo en modo local; en Supabase se guarda cifrada en credenciales
  car?: string           // vehículo y placa (conductores)
  scores: number[]       // calificaciones recibidas (1 a 5)
  completed: number      // viajes completados
}

export interface Trip {
  id: string
  driver: string         // id del conductor
  origin: string
  dest: string
  time: string           // hora de salida (HH:MM)
  seats: number          // asientos libres
  price: number | null   // precio por asiento; null = POR DEFINIR
  status: TripStatus
  members: string[]      // conductor + pasajeros
  stops?: string[]       // nombres de las paradas
  taxi?: number          // tarifa estimada de taxi, se calcula al terminar
  date?: string          // fecha del viaje (AAAA-MM-DD)
  // Mapa
  o?: LatLng             // punto de partida
  d?: LatLng             // destino
  w?: LatLng[]           // paradas
  path?: LatLng[]        // ruta por calles (OSRM)
  km?: number
  mins?: number
  // Seguimiento en vivo
  pos?: LatLng | null    // posición actual del conductor
  progress?: number      // avance simulado, de 0 a 1
  gps?: boolean
  arrived?: boolean
  started?: number       // Date.now() al iniciar
  ended?: string         // hora de fin (HH:MM)
}

export interface Message {
  id?: string
  sender: string
  text: string
  time: string
}

export interface Rating {
  id?: string
  trip: string
  from: string
  to: string
  score: number
}

export interface Db {
  users: User[]
  trips: Trip[]
  messages: Record<string, Message[]>  // por id de viaje
  ratings: Rating[]
}

// Datos del registro mientras se verifica el OTP.
export type PendingUser = Pick<User, 'name' | 'email' | 'role' | 'car'> & { pass: string }
