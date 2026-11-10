import { useState } from 'react'
import type { FormEvent } from 'react'
import { useSession } from '../context'
import { user, passengers, save, notify } from '../store/db'
import { apiUpdateProfile, apiVerifyIdentity } from '../store/cloud'
import { money, institutional, showErrors } from '../lib/utils'
import type { FormErrors } from '../lib/utils'
import { co2Driver, co2Passenger, kg, tripKm, treeDays, CO2_KG_PER_KM } from '../lib/impact'
import { ZONE_NAMES } from '../lib/zones'
import { Empty, Heading, Field, StatusPill } from '../components/ui'
import Profile from '../components/Profile'
import type { Db, Trip } from '../types'

const historyTrips = (db: Db, current: string) => db.trips.filter(t => t.status === 'Finalizado' && t.members.includes(current))

// US21 · US24 · US18 · Historial detallado (finalizados y cancelados)
export function History() {
  const { db, current, rate } = useSession()
  const [filter, setFilter] = useState<'todos' | 'Finalizado' | 'Cancelado'>('todos')
  const [open, setOpen] = useState<string | null>(null)
  const all = db.trips.filter(t => (t.status === 'Finalizado' || t.status === 'Cancelado') && t.members.includes(current))
    .sort((a, b) => (b.date || b.cancelledAt || '').localeCompare(a.date || a.cancelledAt || ''))
  const ts = all.filter(t => filter === 'todos' || t.status === filter)
  const done = all.filter(t => t.status === 'Finalizado')
  const totalKm = done.reduce((a, t) => a + tripKm(t), 0)
  return (
    <>
      <Heading title="Tu historial" hu="US21 · US24 · US18" sub="Detalle de cada viaje: fecha, ruta, horarios, distancia, costo, ahorro y CO₂." />
      {all.length > 0 && <div className="stats" style={{ marginBottom: 18 }}>
        <div><small>Viajes finalizados</small><strong>{done.length}</strong></div>
        <div><small>Distancia total</small><strong>{totalKm.toFixed(1)} km</strong></div>
        <div><small>Cancelados</small><strong>{all.length - done.length}</strong></div>
      </div>}
      {all.length > 0 && <div className="btnrow" role="group" aria-label="Filtrar historial">
        {(['todos', 'Finalizado', 'Cancelado'] as const).map(k => <button key={k} className={filter === k ? '' : 'secondary'} onClick={() => setFilter(k)}>{k === 'todos' ? 'Todos' : k + 's'}</button>)}
      </div>}
      {ts.length ? ts.map(t => {
        const drv = t.driver === current, ps = passengers(t), cancelled = t.status === 'Cancelado'
        const given = db.ratings.find(r => r.trip === t.id && r.from === current)
        const isOpen = open === t.id
        return (
          <div key={t.id} className="card histcard" style={{ marginBottom: 14 }}>
            <div className="top" style={{ marginBottom: 0 }}>
              <div>
                <StatusPill t={t} />
                <h3 style={{ marginTop: 8 }}>{t.origin} → {t.dest}</h3>
                <p className="muted">{t.date || (t.cancelledAt ? t.cancelledAt.slice(0, 10) : '')} · {drv ? 'Tú como conductor · ' + ps.length + ' pasajero(s)' : user(t.driver)?.name}{!cancelled && tripKm(t) ? ' · ' + tripKm(t).toFixed(1) + ' km' : ''}</p>
              </div>
              <div className="row">
                <button className="secondary" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : t.id)}>{isOpen ? 'Ocultar detalle' : 'Ver detalle'}</button>
                {!cancelled && (given
                  ? <span className="pill">Calificaste {'★'.repeat(given.score)}</span>
                  : drv
                    ? ps.length > 0 && <button className="secondary" onClick={() => rate(t.id)}>Calificar pasajero</button>
                    : <button className="secondary" onClick={() => rate(t.id)}>Calificar conductor</button>)}
              </div>
            </div>
            {isOpen && <TripDetail t={t} current={current} />}
          </div>
        )
      }) : <Empty title={all.length ? 'No hay viajes con ese estado' : 'El usuario todavía no tiene viajes registrados'} text="Tus viajes anteriores aparecerán aquí." />}
    </>
  )
}

// US24 · Detalle de un viaje del historial.
function TripDetail({ t, current }: { t: Trip, current: string }) {
  const drv = t.driver === current, ps = passengers(t), d = user(t.driver)
  const km = tripKm(t)
  const rows: [string, string][] = [
    ['Fecha', t.date || (t.cancelledAt ? new Date(t.cancelledAt).toLocaleDateString('es-PE') : '—')],
    ['Hora de salida', t.time],
    ['Hora de llegada', t.ended || '—'],
    ['Partida', t.origin],
    ['Destino', t.dest],
    ['Paradas', t.stops?.length ? t.stops.join(' · ') : '—'],
    ['Distancia', km ? km.toFixed(1) + ' km' : '—'],
    ['Duración', t.mins ? t.mins + ' min' : '—'],
    ['Conductor', (d?.name || '—') + (d?.verified ? ' ✔' : '')],
    ['Vehículo', d?.car || '—'],
    ['Pasajeros', ps.map(id => user(id)?.name).join(', ') || 'Ninguno'],
    ['Precio por asiento', t.price == null ? 'POR DEFINIR' : money(t.price)],
  ]
  if (t.status === 'Cancelado') rows.push(['Motivo de cancelación', t.cancelReason || 'No indicado'])
  else if (drv) {
    rows.push(['Ingreso', money((t.price || 0) * ps.length)])
    rows.push(['CO₂ evitado', kg(co2Driver(t, ps.length))])
  } else {
    rows.push(['Tarifa estimada de taxi', t.taxi ? money(t.taxi) : '—'])
    rows.push(['Ahorro', money((t.taxi || 0) - (t.price || 0))])
    rows.push(['CO₂ evitado', kg(co2Passenger(t))])
  }
  return (
    <dl className="detail">
      {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
    </dl>
  )
}

// US23 · CO₂ ahorrado
export function Impact() {
  const { db, current, isDriver } = useSession()
  const ts = historyTrips(db, current)
  const per = (t: Trip) => t.driver === current ? co2Driver(t, passengers(t).length) : co2Passenger(t)
  const total = ts.reduce((a, t) => a + per(t), 0)
  const community = db.trips.filter(t => t.status === 'Finalizado').reduce((a, t) => a + co2Driver(t, passengers(t).length), 0)
  return (
    <>
      <Heading title="Tu CO₂ ahorrado" hu="US23 · ODS 11 · ODS 13" sub="Emisiones que evitaste al compartir viajes en lugar de ir cada uno en su auto." />
      {ts.length ? (
        <div className="split">
          <div className="card">
            <div className="tag">CO₂ evitado acumulado</div>
            <div className="metric">{kg(total)}</div>
            <p className="muted">En {ts.length} viajes compartidos finalizados · equivale a lo que absorbe un árbol en {treeDays(total)} días.</p>
            <div className="alert">{isDriver
              ? 'CO₂ = distancia (km) × ' + String(CO2_KG_PER_KM).replace('.', ',') + ' kg/km × pasajeros que llevaste'
              : 'CO₂ = distancia (km) × ' + String(CO2_KG_PER_KM).replace('.', ',') + ' kg/km (un auto menos en la vía)'}</div>
            <small>Factor de emisión de un auto a gasolina promedio: 0,192 kg CO₂/km (DEFRA, 2023). Comunidad RutaFlex: {kg(community)} evitados en total.</small>
          </div>
          <div className="card">
            <h3>Cálculo verificado por viaje</h3>
            {ts.slice().reverse().map(t => {
              const n = t.driver === current ? passengers(t).length : 1
              return (
                <div key={t.id} className="row between" style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
                  <div><strong>{t.origin}</strong><br /><small>{t.date} · {tripKm(t).toFixed(1)} km × {String(CO2_KG_PER_KM).replace('.', ',')}{n !== 1 || t.driver === current ? ' × ' + n : ''}</small></div>
                  <strong>{kg(per(t))}</strong>
                </div>
              )
            })}
          </div>
        </div>
      ) : <Empty title="Aún no hay CO₂ evitado" text="Cuando termines un viaje compartido verás aquí las emisiones que evitaste." />}
    </>
  )
}

// US22 · Ahorro del pasajero
export function Savings() {
  const { db, current, go } = useSession()
  const ts = historyTrips(db, current).filter(t => t.driver !== current)
  const saving = (t: Trip) => (t.taxi || 0) - (t.price || 0)
  const total = ts.reduce((a, t) => a + saving(t), 0)
  return (
    <>
      <Heading title="Cada viaje cuenta" hu="US22" sub="Ahorro económico estimado con datos ficticios." />
      {ts.length ? (
        <div className="split">
          <div className="card">
            <div className="tag">Ahorro acumulado</div>
            <div className="metric">{money(total)}</div>
            <p className="muted">En {ts.length} viajes compartidos finalizados.</p>
            <div className="alert">Ahorro = tarifa estimada de taxi − costo compartido</div>
            <small>Tarifas de taxi simuladas. Proveedor, metodología de estimación y tratamiento de diferencias negativas: POR DEFINIR.</small>
            <p style={{ marginTop: 12 }}>🌱 Además evitaste <strong>{kg(ts.reduce((a, t) => a + co2Passenger(t), 0))}</strong> · <button className="link" onClick={() => go('impact')}>Ver CO₂ ahorrado</button></p>
          </div>
          <div className="card">
            <h3>Cálculo básico por viaje</h3>
            {ts.map(t => (
              <div key={t.id} className="row between" style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
                <div><strong>{t.origin}</strong><br /><small>{money(t.taxi || 0)} − {money(t.price || 0)}</small></div>
                <strong>{money(saving(t))}</strong>
              </div>
            ))}
          </div>
        </div>
      ) : <Empty title="No existen datos suficientes para el cálculo" text="Aún no tienes viajes compartidos registrados." />}
    </>
  )
}

// US22 · Ganancias del conductor
export function Earnings() {
  const { db, current } = useSession()
  const ts = historyTrips(db, current).filter(t => t.driver === current)
  const income = (t: Trip) => (t.price || 0) * passengers(t).length
  const total = ts.reduce((a, t) => a + income(t), 0)
  return (
    <>
      <Heading title="Tus ganancias" hu="Conductor" sub="Ingresos estimados por asientos compartidos (datos ficticios)." />
      {ts.length ? (
        <div className="split">
          <div className="card">
            <div className="tag">Total acumulado</div>
            <div className="metric">{money(total)}</div>
            <p className="muted">En {ts.length} viajes terminados.</p>
            <div className="alert">Ingreso = precio por asiento × pasajeros</div>
            <small>Pagos reales y comisiones: POR DEFINIR.</small>
          </div>
          <div className="card">
            <h3>Detalle por viaje</h3>
            {ts.slice().reverse().map(t => (
              <div key={t.id} className="row between" style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
                <div><strong>{t.origin}</strong><br /><small>{t.date} · {money(t.price || 0)} × {passengers(t).length}</small></div>
                <strong>{money(income(t))}</strong>
              </div>
            ))}
          </div>
        </div>
      ) : <Empty title="Aún no tienes viajes terminados" text="Inicia y termina un viaje para ver tus ganancias." />}
    </>
  )
}

// US17 · US04 · US20 · Perfil
export function ProfileView() {
  const { me, current, toast } = useSession()
  const [editing, setEditing] = useState(false)
  const [err, setErr] = useState<FormErrors>({})
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const v = (k: string) => String(f.get(k) || '').trim()
    const p = { name: v('name'), phone: v('phone'), career: v('career'), bio: v('bio'), zone: v('zone'), prefTime: v('prefTime'), car: v('car') }
    const er: FormErrors = {}
    if (!p.name) er.name = 'El nombre es obligatorio.'
    else if (p.name.length < 3) er.name = 'El nombre debe tener al menos 3 caracteres.'
    if (p.phone && !/^9\d{8}$/.test(p.phone)) er.phone = 'Ingresa un celular peruano de 9 dígitos que empiece con 9.'
    if (p.bio.length > 160) er.bio = 'Máximo 160 caracteres.'
    if (me.role === 'conductor' && !p.car) er.car = 'Los conductores deben registrar su vehículo y placa.'
    if (showErrors(er, setErr)) return
    setBusy(true)
    const res = await apiUpdateProfile(current, p)
    setBusy(false)
    if (!res.ok) return toast('No se guardó: ' + res.error)
    const u = user(current)
    if (!u) return
    u.name = p.name
    for (const k of ['phone', 'career', 'bio', 'zone', 'prefTime'] as const) { if (p[k]) u[k] = p[k]; else delete u[k] }
    if (u.role === 'conductor') u.car = p.car
    save()
    setEditing(false)
    toast('Perfil actualizado.')
  }

  return (
    <>
      <Heading title="Mi perfil" hu="US17 · US04 · US20" sub="Consulta y actualiza tus datos. El correo institucional y el rol no se pueden cambiar." />
      <div className="split">
        {editing ? (
          <div className="card form">
            <h2>Editar perfil</h2>
            <form onSubmit={submit} noValidate>
              <Field id="name" label="Nombre *" defaultValue={me.name} error={err.name} maxLength={60} />
              <div className="field"><label htmlFor="email">Correo institucional</label><input id="email" value={me.email} disabled /></div>
              <div className="grid">
                <Field id="phone" label="Celular" inputMode="numeric" defaultValue={me.phone ?? ''} placeholder="9XXXXXXXX" error={err.phone} maxLength={9} />
                <Field id="career" label="Carrera" defaultValue={me.career ?? ''} maxLength={60} />
              </div>
              <div className="grid">
                <div className="field">
                  <label htmlFor="zone">Zona habitual de partida</label>
                  <select id="zone" name="zone" defaultValue={me.zone ?? ''}>
                    <option value="">Sin definir</option>
                    {ZONE_NAMES.map(z => <option key={z}>{z}</option>)}
                  </select>
                </div>
                <Field id="prefTime" label="Hora habitual de viaje" type="time" defaultValue={me.prefTime ?? ''} />
              </div>
              {me.role === 'conductor' && <Field id="car" label="Vehículo y placa *" defaultValue={me.car ?? ''} error={err.car} />}
              <div className="field">
                <label htmlFor="bio">Presentación breve</label>
                <textarea id="bio" name="bio" defaultValue={me.bio ?? ''} rows={3} maxLength={200} className={err.bio ? 'invalid' : ''} />
                <div className="error">{err.bio || ''}</div>
              </div>
              <p className="muted">La zona y la hora habitual se usan para tus recomendaciones de viaje (US08).</p>
              <div className="row">
                <button disabled={busy}>{busy ? 'Guardando…' : 'Guardar cambios'}</button>
                <button type="button" className="secondary" onClick={() => { setEditing(false); setErr({}) }}>Cancelar</button>
              </div>
            </form>
          </div>
        ) : (
          <div>
            <Profile u={me} />
            <button className="full" style={{ marginTop: 14 }} onClick={() => setEditing(true)}>✏️ Editar perfil</button>
          </div>
        )}
        <VerifyIdentity />
      </div>
    </>
  )
}

// US20 · Validar identidad: correo institucional + código universitario + código enviado al correo (simulado).
function VerifyIdentity() {
  const { me, current, toast } = useSession()
  const [step, setStep] = useState<'start' | 'code'>('start')
  const [student, setStudent] = useState('')
  const [err, setErr] = useState<FormErrors>({})
  const [busy, setBusy] = useState(false)

  if (me.verified) return (
    <div className="card">
      <div className="tag">US20 · Identidad</div>
      <h2><span className="verified">✔</span> Identidad verificada</h2>
      <p className="muted">Validada con tu correo institucional {me.email}{me.verifiedAt ? ' el ' + me.verifiedAt : ''}.</p>
      {me.studentCode && <p>Código universitario: <strong>{me.studentCode.slice(0, 4)}••••</strong></p>}
      <small>Los demás usuarios ven la insignia ✔ junto a tu nombre.</small>
    </div>
  )

  function sendCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const code = String(new FormData(e.currentTarget).get('student')).trim()
    const er: FormErrors = {}
    if (!institutional(me.email)) er.student = 'Tu cuenta no usa un correo institucional válido.'
    else if (!/^\d{8}$/.test(code)) er.student = 'El código universitario tiene 8 dígitos.'
    if (showErrors(er, setErr)) return
    setStudent(code)
    setStep('code')
    toast('Código de verificación enviado a ' + me.email + ' (simulado: 654321).')
  }

  async function confirm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const code = String(new FormData(e.currentTarget).get('vcode')).trim()
    if (code !== '654321') return showErrors({ vcode: 'Código incorrecto. Revisa el correo institucional.' }, setErr)
    setBusy(true)
    const res = await apiVerifyIdentity(current, student)
    setBusy(false)
    if (!res.ok) return showErrors({ vcode: 'No se pudo verificar: ' + res.error }, setErr)
    const u = user(current)
    if (!u) return
    u.verified = true
    u.studentCode = student
    u.verifiedAt = new Date().toISOString().slice(0, 10)
    // US16 · Con el backend en línea el aviso lo crea POST /api/verify.
    if (!res.cloud) notify([current], 'viaje', 'Tu identidad fue verificada. Ahora tu perfil muestra la insignia ✔.')
    save()
    toast('Identidad verificada.')
  }

  return (
    <div className="card form">
      <div className="tag">US20 · Validar identidad</div>
      <h2>Verifica que eres estudiante</h2>
      <p className="muted">Confirmamos tu identidad con tu correo institucional <strong>{me.email}</strong> y tu código universitario. Los usuarios verificados generan más confianza al compartir viajes.</p>
      {step === 'start' ? (
        <form onSubmit={sendCode} noValidate>
          <Field id="student" label="Código universitario (8 dígitos)" inputMode="numeric" maxLength={8} placeholder="20231234" error={err.student} />
          <button className="full">Enviar código a mi correo</button>
        </form>
      ) : (
        <form onSubmit={confirm} noValidate>
          <div className="alert">Código ficticio enviado a {me.email}: <strong>654321</strong></div>
          <Field id="vcode" label="Código de verificación" inputMode="numeric" maxLength={6} error={err.vcode} />
          <button className="full" disabled={busy}>{busy ? 'Verificando…' : 'Verificar identidad'}</button>
          <button type="button" className="link" onClick={() => { setStep('start'); setErr({}) }}>Cambiar código universitario</button>
        </form>
      )}
    </div>
  )
}
