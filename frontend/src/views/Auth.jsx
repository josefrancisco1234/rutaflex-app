import { useState } from 'react'
import { useApp } from '../context'
import { getDb, save } from '../store/db'
import { cloudReady, cloudLogin } from '../store/cloud'
import { institutional, showErrors } from '../lib/utils'
import { Field } from '../components/ui'

function AuthLayout({ children }) {
  return (
    <div className="auth">
      <div className="authaside">
        <span className="pill">Carpooling universitario</span>
        <h1 style={{ marginTop: 20 }}>Mismo destino.<br /><span style={{ color: 'var(--green)' }}>Mejor camino.</span></h1>
        <p className="muted">Conecta con estudiantes, comparte viajes y conoce tu ahorro.</p>
        <div className="note">
          <strong>Dos perfiles, un mismo trayecto.</strong>
          <p className="muted">Pasajero: busca, reserva y sigue el viaje en el mapa.<br />Conductor: publica, inicia y termina el viaje al llegar.</p>
          <small>Prototipo académico. Todos los usuarios y viajes son ficticios.</small>
        </div>
      </div>
      <div className="card authform">{children}</div>
    </div>
  )
}

// US01 · Iniciar sesión
export function Login() {
  const { go, login, toast } = useApp()
  const [err, setErr] = useState({})
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    const f = new FormData(e.target)
    const email = String(f.get('email')).trim().toLowerCase(), pass = String(f.get('password'))
    const er = {}
    if (!institutional(email)) er.email = 'Solo se admite el dominio institucional de demostración aloe.ulima.edu.pe.'
    if (!pass) er.password = 'Ingresa tu contraseña.'
    if (showErrors(er, setErr)) return
    let id = null
    if (cloudReady()) {
      setBusy(true)
      try { id = await cloudLogin(email, pass) } catch { toast('No se pudo conectar con Supabase.') }
      setBusy(false)
    } else {
      id = getDb().users.find(u => u.email === email && u.pass === pass)?.id
    }
    if (!id) return showErrors({ password: 'Correo o contraseña incorrectos.' }, setErr)
    login(id)
  }

  return (
    <AuthLayout>
      <div className="tag">US01</div>
      <h2>Inicia sesión</h2>
      <p className="muted">Ingresa con tu correo universitario.</p>
      <form onSubmit={submit} noValidate>
        <Field id="email" label="Correo institucional" type="email" error={err.email} />
        <Field id="password" label="Contraseña" type="password" error={err.password} />
        <button className="full" disabled={busy}>{busy ? 'Verificando…' : 'Iniciar sesión'}</button>
      </form>
      <button className="link full" onClick={() => go('register')}>¿Primera vez? Regístrate</button>
      <div className="alert">
        <strong>Perfiles ficticios de exposición</strong> · contraseña: RutaFlex1!
        <div className="rolepick">
          <button className="secondary" onClick={() => login('g')}><span>🎒</span><strong>Pasajero</strong>gabriel@aloe.ulima.edu.pe</button>
          <button className="secondary" onClick={() => login('a')}><span>🚗</span><strong>Conductor</strong>andrea@aloe.ulima.edu.pe</button>
        </div>
      </div>
    </AuthLayout>
  )
}

// US02 · Registro (paso 1)
export function Register() {
  const { go, setPending, setOtpExpired } = useApp()
  const [err, setErr] = useState({})
  const [role, setRole] = useState('pasajero')

  function submit(e) {
    e.preventDefault()
    const f = new FormData(e.target)
    const name = String(f.get('name')).trim(), email = String(f.get('email')).trim().toLowerCase()
    const pass = String(f.get('password')), car = String(f.get('car') || '').trim()
    const er = {}
    if (!name) er.name = 'Completa tu nombre.'
    if (!institutional(email)) er.email = 'Utiliza un correo institucional del dominio de demostración.'
    else if (getDb().users.some(u => u.email === email)) er.email = 'Este correo ya está registrado.'
    if (!pass.trim()) er.password = 'Completa tu contraseña.'
    if (role === 'conductor' && !car) er.car = 'Los conductores deben registrar su vehículo.'
    if (showErrors(er, setErr)) return
    setPending({ name, email, pass, role, ...(role === 'conductor' ? { car } : {}) })
    setOtpExpired(false)
    go('otp')
  }

  return (
    <AuthLayout>
      <div className="tag">US02 · Paso 1 de 2</div>
      <h2>Crea tu cuenta</h2>
      <form onSubmit={submit} noValidate>
        <Field id="name" label="Nombre *" error={err.name} />
        <Field id="email" label="Correo institucional *" type="email" error={err.email} />
        <Field id="password" label="Contraseña *" type="password" error={err.password} />
        <div className="field">
          <label htmlFor="role">Tipo de perfil *</label>
          <select id="role" value={role} onChange={e => setRole(e.target.value)}>
            <option value="pasajero">🎒 Pasajero — busco viajes</option>
            <option value="conductor">🚗 Conductor — ofrezco viajes</option>
          </select>
        </div>
        {role === 'conductor' && <Field id="car" label="Vehículo y placa *" placeholder="Ej. Sedán rojo · ABC-123" error={err.car} />}
        <p className="muted">Universidad de Lima · dominio demo: aloe.ulima.edu.pe. Lista completa de dominios y política de contraseña: POR DEFINIR.</p>
        <button className="full">Continuar a verificación</button>
      </form>
      <button className="link full" onClick={() => go('login')}>Ya tengo una cuenta</button>
    </AuthLayout>
  )
}

// US02 · Verificación OTP (paso 2)
export function Otp() {
  const { go, toast, pending, setPending, otpExpired, setOtpExpired } = useApp()
  const [err, setErr] = useState({})

  function submit(e) {
    e.preventDefault()
    if (!pending) return go('register')
    if (otpExpired) return showErrors({ code: 'El código está vencido. Solicita un nuevo código simulado.' }, setErr)
    if (String(new FormData(e.target).get('code')).trim() !== '123456') return showErrors({ code: 'Código inválido.' }, setErr)
    getDb().users.push({ ...pending, id: 'u' + Date.now(), scores: [], completed: 0 })
    save()
    setPending(null)
    go('login')
    toast('Registro exitoso. Ya puedes iniciar sesión.')
  }

  return (
    <AuthLayout>
      <div className="tag">US02 · Paso 2 de 2</div>
      <h2>Verifica tu correo</h2>
      <p className="muted">Envío simulado a {pending?.email}.</p>
      <div className="alert">Código ficticio: <strong>123456</strong><br />Vigencia y longitud productivas: POR DEFINIR.</div>
      <form onSubmit={submit} noValidate>
        <Field id="code" label="Código de verificación" inputMode="numeric" error={err.code} />
        <button className="full">Verificar y registrar</button>
      </form>
      <button className="link" onClick={() => { setOtpExpired(true); toast('Código marcado como vencido para la prueba') }}>Simular código vencido</button>
      <button className="link" onClick={() => { setOtpExpired(false); toast('Nuevo código simulado: 123456') }}>Simular nuevo código</button>
      <button className="link" onClick={() => go('register')}>Volver</button>
    </AuthLayout>
  )
}
