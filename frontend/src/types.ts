// Modelo de datos de la app. En PostgreSQL cada entidad tiene su tabla (ver backend/schema.sql).

// Coordenada [latitud, longitud].
export type LatLng = [number, number]

export type Role = 'pasajero' | 'conductor'

// US19 · Última ubicación compartida por un participante.
export interface SharedSpot { p: LatLng, at: number }

export type TripStatus = 'Activo' | 'En curso' | 'Finalizado' | 'Cancelado'

export interface User {
  id: string
  role: Role
  name: string
  email: string
  pass?: string          // solo en modo local; en el backend se guarda cifrada en credenciales
  car?: string           // vehículo y placa (conductores)
  scores: number[]       // calificaciones recibidas (1 a 5)
  completed: number      // viajes completados
  // Release 2
  verified?: boolean     // US20 · identidad validada con el correo institucional
  verifiedAt?: string    // fecha de validación (AAAA-MM-DD)
  studentCode?: string   // US20 · código universitario (8 dígitos)
  phone?: string         // US04 · celular (9 dígitos)
  career?: string        // US04 · carrera
  bio?: string           // US04 · presentación breve
  zone?: string          // US04 · US08 · distrito habitual de partida
  prefTime?: string      // US04 · US08 · hora habitual de viaje (HH:MM)
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
  // Release 2
  shares?: Record<string, SharedSpot>  // US19 · ubicación compartida por cada participante
  cancelReason?: string  // US12
  cancelledAt?: string   // US12 · fecha y hora de cancelación
  editedAt?: string      // US11 · última edición
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

// US15 · US16 · Avisos para un usuario.
export type NoticeKind = 'mensaje' | 'viaje'
export interface Notice {
  id: string
  to: string             // destinatario
  kind: NoticeKind
  text: string
  trip?: string
  at: string             // fecha y hora ISO
  read: boolean
}

export interface Db {
  users: User[]
  trips: Trip[]
  messages: Record<string, Message[]>  // por id de viaje
  ratings: Rating[]
  notices: Notice[]
}

// Datos del registro mientras se verifica el OTP.
export type PendingUser = Pick<User, 'name' | 'email' | 'role' | 'car'> & { pass: string }
