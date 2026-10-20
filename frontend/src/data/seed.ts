import type { Db, LatLng } from '../types'

// Datos mock iniciales (ficticios). También se usan para cargar Supabase al reiniciar la demo.
export const ULIMA: LatLng = [-12.0848, -76.9712]

export const seed = (): Db => ({
  users: [
    { id: 'g', role: 'pasajero', name: 'Gabriel', email: 'gabriel@aloe.ulima.edu.pe', pass: 'RutaFlex1!', scores: [5, 4], completed: 3 },
    { id: 'l', role: 'pasajero', name: 'Lucía Paredes', email: 'lucia@aloe.ulima.edu.pe', pass: 'RutaFlex1!', scores: [5], completed: 2 },
    { id: 'a', role: 'conductor', name: 'Andrea Salazar', email: 'andrea@aloe.ulima.edu.pe', pass: 'RutaFlex1!', scores: [5, 5, 4, 5, 5], completed: 18, car: 'Sedán azul · DEM-101' },
    { id: 'd', role: 'conductor', name: 'Diego Ríos', email: 'diego@aloe.ulima.edu.pe', pass: 'RutaFlex1!', scores: [4, 5, 4, 5], completed: 12, car: 'Hatchback gris · DEM-202' },
    { id: 'v', role: 'conductor', name: 'Valeria Torres', email: 'valeria@aloe.ulima.edu.pe', pass: 'RutaFlex1!', scores: [], completed: 0, car: 'Sedán blanco · DEM-303' },
  ],
  trips: [
    { id: 't1', driver: 'a', origin: 'Miraflores · Parque Kennedy', dest: 'Universidad de Lima', time: '07:15', seats: 2, price: 8, status: 'Activo', members: ['g', 'a'], stops: ['Av. Benavides', 'Javier Prado'], o: [-12.1219, -77.0298], d: ULIMA, w: [[-12.1272, -77.0105], [-12.0902, -76.993]] },
    { id: 't2', driver: 'd', origin: 'San Isidro · Av. Arequipa', dest: 'Universidad de Lima', time: '08:00', seats: 3, price: 7, status: 'Activo', members: ['d'], stops: ['Javier Prado'], o: [-12.096, -77.0345], d: ULIMA, w: [[-12.0905, -77.01]] },
    { id: 't3', driver: 'v', origin: 'La Molina · Av. La Fontana', dest: 'Universidad de Lima', time: '09:30', seats: 2, price: 5, status: 'Activo', members: ['v'], stops: ['Av. Los Frutales'], o: [-12.0745, -76.9505], d: ULIMA, w: [[-12.0725, -76.961]] },
    { id: 't4', driver: 'a', origin: 'Surco · Óvalo Higuereta', dest: 'Universidad de Lima', time: '12:30', seats: 1, price: 6, status: 'Activo', members: ['a'], stops: ['Av. Primavera'], o: [-12.1305, -76.9985], d: ULIMA, w: [[-12.1115, -76.988]] },
    { id: 't5', driver: 'd', origin: 'San Borja · Av. San Luis', dest: 'Universidad de Lima', time: '17:00', seats: 2, price: 6, status: 'Activo', members: ['d'], stops: ['Javier Prado'], o: [-12.0985, -76.9985], d: ULIMA, w: [[-12.089, -76.985]] },
    { id: 'h1', driver: 'a', origin: 'Miraflores', dest: 'Universidad de Lima', time: '07:15', seats: 0, price: 8, taxi: 24, status: 'Finalizado', members: ['g', 'a'], date: '2026-10-12' },
    { id: 'h2', driver: 'd', origin: 'San Isidro', dest: 'Universidad de Lima', time: '08:00', seats: 0, price: 7, taxi: 22, status: 'Finalizado', members: ['g', 'd'], date: '2026-10-13' },
    { id: 'h3', driver: 'a', origin: 'Surco', dest: 'Universidad de Lima', time: '12:30', seats: 0, price: 6, taxi: 20, status: 'Finalizado', members: ['g', 'a'], date: '2026-10-14' },
  ],
  messages: {
    t1: [
      { sender: 'a', text: '¡Hola, Gabriel! Nos encontramos en el punto de partida.', time: '06:50' },
      { sender: 'g', text: 'Perfecto, estaré allí antes de las 7:15.', time: '06:52' },
    ],
  },
  ratings: [],
})
