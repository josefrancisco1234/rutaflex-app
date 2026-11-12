import { useState } from 'react'
import type { FormEvent } from 'react'
import { useSession } from '../context'
import { save, user } from '../store/db'
import { apiDriverApply, refreshCloud } from '../store/cloud'
import { readApplication } from '../lib/driver'
import { showErrors } from '../lib/utils'
import type { FormErrors } from '../lib/utils'
import { Heading } from '../components/ui'
import { DriverFields } from './Auth'

// Estado de la solicitud de conductor. Si fue rechazada, muestra el motivo y permite corregirla y reenviarla.
export default function Application() {
  const { me, current, go, toast } = useSession()
  const [err, setErr] = useState<FormErrors>({})
  const [busy, setBusy] = useState(false)
  const a = me.application
  const status = me.driverStatus

  async function resend(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const { app, phone, car, er } = readApplication(new FormData(e.currentTarget))
    if (showErrors(er, setErr)) return
    setBusy(true)
    const res = await apiDriverApply(current, { ...app, phone })
    setBusy(false)
    if (!res.ok) return toast('No se envió: ' + res.error)
    if (res.cloud) await refreshCloud()
    else {
      const u = user(current)
      if (u) { u.driverStatus = 'pendiente'; delete u.rejectReason; delete u.reviewedAt; u.application = app; u.phone = phone; u.car = car; save() }
    }
    toast('Solicitud enviada de nuevo. Un administrador la revisará.')
  }

  if (status === 'aprobado') return (
    <>
      <Heading title="Solicitud aprobada" hu="Conductor" sub="Un administrador validó tus datos." />
      <div className="card"><p>✔ Ya puedes publicar tus rutas.</p><button onClick={() => go('dhome')}>Ir a mi panel</button></div>
    </>
  )

  return (
    <>
      <Heading title="Mi solicitud de conductor" hu="Conductor" sub="Antes de publicar rutas, un administrador revisa tus datos y tu vehículo." />
      <div className="split">
        <div className="card">
          {status === 'rechazado' ? <>
            <span className="pill state bad">✖ Solicitud rechazada</span>
            <div className="alert bad"><strong>Motivo:</strong> {me.rejectReason || 'Sin motivo registrado.'}</div>
            <p className="muted">Corrige los datos y vuelve a enviar tu solicitud.</p>
            <form onSubmit={resend} noValidate>
              <DriverFields err={err} app={a} phone={me.phone} />
              <button className="full" disabled={busy}>{busy ? 'Enviando…' : 'Enviar de nuevo a revisión'}</button>
            </form>
          </> : <>
            <span className="pill state warn">⏳ En revisión</span>
            <h2 style={{ marginTop: 14 }}>Estamos revisando tu solicitud</h2>
            <p className="muted">Te avisaremos con una notificación 🔔 cuando un administrador la apruebe o la rechace.</p>
            {a && <dl className="detail">
              <div><dt>Vehículo</dt><dd>{a.model}</dd></div>
              <div><dt>Placa</dt><dd>{a.plate}</dd></div>
              <div><dt>Licencia</dt><dd>{a.license}</dd></div>
              <div><dt>SOAT vence</dt><dd>{a.soat}</dd></div>
              <div><dt>Celular</dt><dd>{me.phone || '—'}</dd></div>
              <div><dt>Enviada</dt><dd>{a.submittedAt}</dd></div>
            </dl>}
          </>}
        </div>
        <div className="card">
          <h3>¿Cómo funciona?</h3>
          <ol className="steps">
            <li>Te registras como conductor con los datos de tu vehículo.</li>
            <li>Un administrador revisa que tu licencia y tu SOAT estén vigentes.</li>
            <li>Si eres apto, se aprueba tu cuenta y puedes publicar rutas.</li>
            <li>Si no, recibes el motivo y puedes corregir y reenviar.</li>
          </ol>
        </div>
      </div>
    </>
  )
}
