import { useEffect, useRef, useState } from 'react'
import { useApp } from '../context'
import type { EndSummary } from '../context'
import { getDb, trip, user, save, passengers, notify } from '../store/db'
import { apiCancelTrip } from '../store/cloud'
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

const REASONS = ['Problema con el vehículo', 'Cambio de horario', 'Emergencia personal', 'Clima o tránsito', 'Otro motivo']

// US12 · Cancelar viaje (conductor) o cancelar la reserva (pasajero).
export function CancelTripModal({ tripId }: { tripId: string }) {
  const { current, closeModal, toast, go } = useApp()
  const [reason, setReason] = useState('')
  const [other, setOther] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const t = trip(tripId)
  const drv = !!t && t.driver === current
  const ps = t ? passengers(t) : []

  async function confirm() {
    const t = trip(tripId)
    if (!t || !current || !t.members.includes(current)) { closeModal(); return toast('Cancelación no permitida.') }
    if (t.status !== 'Activo') { closeModal(); return toast('Solo se cancelan viajes que todavía no han iniciado.') }
    const why = reason === 'Otro motivo' ? other.trim() : reason
    if (drv && !why) return setErr('Selecciona o escribe el motivo de la cancelación.')
    const route = t.origin + ' → ' + t.dest + ' (' + t.time + ')'
    if (drv) {
      setBusy(true)
      const res = await apiCancelTrip(t.id, current, why)
      setBusy(false)
      if (!res.ok) return setErr('No se pudo cancelar: ' + res.error)
      t.status = 'Cancelado'
      t.cancelReason = why
      t.cancelledAt = new Date().toISOString()
      // US16 · Con el backend en línea el aviso lo crea POST /api/cancel-trip.
      if (!res.cloud) notify(passengers(t), 'viaje', 'El viaje ' + route + ' fue cancelado por el conductor. Motivo: ' + why + '.', t.id)
      save()
      closeModal()
      go('dhome')
      toast('Viaje cancelado. ' + (ps.length ? 'Se notificó a ' + ps.length + ' pasajero(s).' : 'No tenía pasajeros.'))
    } else {
      t.members = t.members.filter(id => id !== current)
      t.seats++
      delete t.shares?.[current]
      notify([t.driver], 'viaje', (user(current)?.name || 'Un pasajero') + ' canceló su reserva en tu viaje ' + route + '.' + (why ? ' Motivo: ' + why + '.' : ''), t.id)
      save()
      closeModal()
      go('mytrips')
      toast('Reserva cancelada. Se liberó tu asiento y se avisó al conductor.')
    }
  }

  return (
    <div className="overlay">
      <div className="card modal" role="dialog" aria-modal="true" aria-labelledby="cancel-title">
        <div className="tag">US12</div>
        <h2 id="cancel-title">{drv ? 'Cancelar viaje' : 'Cancelar mi reserva'}</h2>
        <p className="muted">{t?.origin} → {t?.dest} · {t?.time}</p>
        <div className="alert bad">{drv
          ? (ps.length ? 'Se avisará a ' + ps.length + ' pasajero(s): ' + ps.map(id => user(id)?.name).join(', ') + '.' : 'Este viaje no tiene pasajeros.') + ' Esta acción no se puede deshacer.'
          : 'Se liberará tu asiento y se avisará al conductor.'}</div>
        <div className="field">
          <label htmlFor="reason">Motivo{drv ? ' *' : ' (opcional)'}</label>
          <select id="reason" value={reason} onChange={e => { setReason(e.target.value); setErr('') }}>
            <option value="">Selecciona un motivo</option>
            {REASONS.map(r => <option key={r}>{r}</option>)}
          </select>
        </div>
        {reason === 'Otro motivo' && <div className="field"><label htmlFor="other">Describe el motivo</label><input id="other" value={other} onChange={e => setOther(e.target.value)} maxLength={120} /></div>}
        <div className="error">{err}</div>
        <div className="row">
          <button className="danger" onClick={confirm} disabled={busy}>{busy ? 'Cancelando…' : drv ? 'Cancelar viaje' : 'Cancelar reserva'}</button>
          <button className="secondary" onClick={closeModal}>Volver</button>
        </div>
      </div>
    </div>
  )
}
