import { getDb, notify, passengers } from './db'

// Acciones de administración en modo local (sin backend). Con el backend en línea
// las hace el servidor (POST /api/admin-*) y los cambios llegan con el sondeo.

// Cancela los viajes por iniciar que conduce y libera los asientos que tenía reservados.
function detach(id: string, why: string) {
  const db = getDb()
  const reason = 'la cuenta del conductor fue ' + why
  db.trips.forEach(t => {
    if (t.status !== 'Activo') return
    if (t.driver === id) {
      t.status = 'Cancelado'
      t.cancelReason = reason[0].toUpperCase() + reason.slice(1)
      t.cancelledAt = new Date().toISOString()
      notify(passengers(t), 'viaje', 'El viaje ' + t.origin + ' → ' + t.dest + ' (' + t.time + ') fue cancelado porque ' + reason + '.', t.id)
    } else if (t.members.includes(id)) {
      t.members = t.members.filter(m => m !== id)
      t.seats++
    }
  })
}

export function localBan(id: string, ban: boolean, reason: string) {
  const u = getDb().users.find(x => x.id === id)
  if (!u) return
  if (ban) { u.banned = true; u.banReason = reason; detach(id, 'suspendida') }
  else { delete u.banned; delete u.banReason }
}

export function localDelete(id: string) {
  const db = getDb()
  detach(id, 'eliminada')
  const gone = new Set(db.trips.filter(t => t.driver === id).map(t => t.id))
  db.trips = db.trips.filter(t => !gone.has(t.id))
  db.trips.forEach(t => { if (t.members.includes(id)) t.members = t.members.filter(m => m !== id) })
  gone.forEach(tid => delete db.messages[tid])
  for (const [tid, list] of Object.entries(db.messages)) db.messages[tid] = list.filter(m => m.sender !== id)
  db.ratings = db.ratings.filter(r => r.from !== id && r.to !== id && !gone.has(r.trip))
  db.notices = db.notices.filter(n => n.to !== id)
  db.users = db.users.filter(u => u.id !== id)
}
