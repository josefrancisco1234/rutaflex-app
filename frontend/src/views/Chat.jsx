import { useEffect, useRef, useState } from 'react'
import { useApp } from '../context'
import { getDb, trip, user, save, passengers, active } from '../store/db'
import { nowTime } from '../lib/utils'
import { Empty, Heading, Back } from '../components/ui'

const canChat = (t, current) => active(t) && t.members.includes(current)

// US13 · Conversaciones
export function Chats() {
  const { db, current, go } = useApp()
  const ts = db.trips.filter(t => canChat(t, current))
  return (
    <>
      <Heading title="Conversaciones" hu="US13 · US14" sub="Solo viajes activos en los que participas." />
      {ts.length ? ts.map(t => (
        <div key={t.id} className="card top">
          <div>
            <h3>{t.origin} → {t.dest}</h3>
            <p className="muted">{t.driver === current ? passengers(t).map(id => user(id)?.name).join(', ') || 'Sin pasajeros aún' : user(t.driver)?.name} · {t.time}</p>
          </div>
          <button onClick={() => go('chat', t.id)}>Abrir chat</button>
        </div>
      )) : <Empty title="No tienes chats habilitados" text="Debes formar parte de un viaje activo." />}
    </>
  )
}

// US14 · Chat del viaje
export function Chat() {
  const { db, current, selected, go, toast } = useApp()
  const t = trip(selected)
  const msgs = (t && db.messages[t.id]) || []
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const box = useRef(null)
  const input = useRef(null)
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight }, [msgs.length])

  if (!canChat(t, current)) {
    return <>
      <Back go={go} to="chats" />
      <Heading title="Chat no habilitado" hu="US13 · US14" />
      <Empty title="Acceso restringido" text="Solo los participantes de un viaje activo pueden consultar y enviar mensajes." />
    </>
  }

  const other = t.driver === current ? (passengers(t)[0] ? user(passengers(t)[0]) : null) : user(t.driver)
  const push = m => { (getDb().messages[t.id] ??= []).push(m); save() }

  function send(e) {
    e.preventDefault()
    if (!canChat(trip(selected), current)) return toast('Envío restringido: chat no habilitado.')
    const value = text.trim()
    if (!value) { setErr('Escribe un mensaje antes de enviar.'); return input.current?.focus() }
    setErr('')
    push({ sender: current, text: value, time: nowTime() })
    setText('')
    input.current?.focus()
  }

  function reply() {
    const o = t.members.find(id => id !== current)
    if (!o) return toast('No hay otro participante en esta ruta.')
    push({ sender: o, text: '¡Perfecto! Coordinamos en el punto de partida.', time: nowTime() })
  }

  return (
    <>
      <Back go={go} to="trip" id={t.id} label="← Volver al viaje" />
      <Heading title="Chat del viaje" hu="US13 · US14" sub={t.origin + ' → ' + t.dest} />
      <div className="card form">
        <div className="row">
          <span className="avatar">{other ? other.name[0] : '?'}</span>
          <div><strong>{other ? other.name : 'Sin pasajeros todavía'}</strong><br /><small>Conversación asociada al viaje {t.id}</small></div>
        </div>
        <div className="messages" ref={box}>
          {msgs.length ? msgs.map((m, i) => (
            <div key={m.id || i} className={'bubble' + (m.sender === current ? ' me' : '')}>
              <small>{user(m.sender)?.name || 'Usuario'}</small>{m.text}<small>{m.time} · Entregado</small>
            </div>
          )) : <p className="muted">Todavía no hay mensajes. Inicia la conversación.</p>}
        </div>
        <form className="search" onSubmit={send}>
          <input ref={input} id="message" aria-label="Mensaje" placeholder="Escribe un mensaje…" autoComplete="off" value={text} onChange={e => setText(e.target.value)} className={err ? 'invalid' : ''} />
          <button>Enviar →</button>
        </form>
        <div className="error">{err}</div>
        <button className="link" onClick={reply}>Simular respuesta del otro participante</button>
      </div>
    </>
  )
}
