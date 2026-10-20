import { useEffect, useRef, useState } from 'react'
import { useApp } from '../context'
import type { EndSummary } from '../context'
import { getDb, trip, user, save } from '../store/db'
import { money } from '../lib/utils'

// US18 · Modal de calificación (1 a 5 estrellas).
export function RatingModal({ tripId, target }: { tripId: string, target: string }) {
  const { current, closeModal, toast } = useApp()
  const [score, setScore] = useState(0)
  const [err, setErr] = useState('')
  const first = useRef<HTMLButtonElement>(null)
  const t = trip(tripId)
  useEffect(() => { first.current?.focus() }, [])

  function submit() {
    const t = trip(tripId), to = user(target)
    if (t?.status !== 'Finalizado' || !current || !to || !t.members.includes(current)) { closeModal(); return toast('Calificación no permitida.') }
    if (!Number.isInteger(score) || score < 1 || score > 5) return setErr('Selecciona una puntuación válida entre 1 y 5.')
    to.scores.push(score)
    getDb().ratings.push({ trip: t.id, from: current, to: target, score })
    save()
    closeModal()
    toast('Evaluación registrada. Reputación actualizada.')
  }

  return (
    <div className="overlay">
      <div className="card modal" role="dialog" aria-modal="true" aria-labelledby="rate-title">
        <div className="tag">US18</div>
        <h2 id="rate-title">Califica {t?.driver === current ? 'a tu pasajero' : 'tu viaje'}</h2>
        <p className="muted">{user(target)?.name} · {t?.origin} → {t?.dest}</p>
        <div className="row" role="group" aria-label="Puntuación de 1 a 5">
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} ref={n === 1 ? first : null} className={'starbtn' + (n <= score ? ' selected' : '')} aria-label={n + ' estrellas'} onClick={() => setScore(n)}>★</button>
          ))}
        </div>
        <div className="error">{err}</div>
        <p className="muted">Selecciona entre 1 y 5 estrellas.</p>
        <div className="row">
          <button onClick={submit}>Registrar evaluación</button>
          <button className="secondary" onClick={closeModal}>Volver</button>
        </div>
        <small>Política de evaluaciones repetidas: POR DEFINIR en IS2.</small>
      </div>
    </div>
  )
}

// EXT-3 · Resumen al terminar el viaje.
export function EndTripModal({ dest, dist, mins, ps, income }: EndSummary) {
  const { closeModal, go } = useApp()
  return (
    <div className="overlay">
      <div className="card modal" role="dialog" aria-modal="true">
        <div className="tag">Viaje terminado</div>
        <h2>🏁 ¡Llegaste a {dest}!</h2>
        <div className="stats" style={{ margin: '16px 0' }}>
          <div><small>Distancia</small><strong>{dist.toFixed(1)} km</strong></div>
          <div><small>Duración</small><strong>{mins ? mins + ' min' : '—'}</strong></div>
          <div><small>Pasajeros</small><strong>{ps}</strong></div>
        </div>
        <p>Ingresos del viaje: <strong>{money(income)}</strong></p>
        <p className="muted">Los pasajeros ya pueden calificarte desde su historial.</p>
        <div className="row">
          <button onClick={() => { closeModal(); go('history') }}>Ver historial</button>
          <button className="secondary" onClick={() => { closeModal(); go('dhome') }}>Volver al panel</button>
        </div>
      </div>
    </div>
  )
}
