import { getPath, pathLen } from './geo'
import type { Trip } from '../types'

// US23 · CO₂ evitado.
// Factor: 0,192 kg de CO₂ por km de un auto a gasolina promedio (DEFRA 2023, "average petrol car").
// Cada pasajero que comparte el viaje deja de usar un auto propio o un taxi durante el mismo recorrido.
export const CO2_KG_PER_KM = 0.192

// Distancia del viaje en km: la registrada, la de la ruta por calles o la línea entre paradas.
export function tripKm(t: Trip) {
  if (t.km) return t.km
  const p = getPath(t)
  return p ? pathLen(p) / 1000 : 0
}

// CO₂ evitado por un pasajero en el viaje.
export const co2Passenger = (t: Trip) => tripKm(t) * CO2_KG_PER_KM
// CO₂ evitado por el conductor gracias a los pasajeros que llevó (un auto menos por pasajero).
export const co2Driver = (t: Trip, passengers: number) => tripKm(t) * CO2_KG_PER_KM * passengers

export const kg = (n: number) => n.toFixed(2).replace('.', ',') + ' kg CO₂'
// Equivalencia didáctica: un árbol absorbe ~21 kg de CO₂ al año (≈ 0,058 kg por día).
export const treeDays = (kgCo2: number) => Math.round(kgCo2 / 0.058)
