export const money = n => 'S/ ' + Number(n).toFixed(2)
export const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
export const institutional = email => /^[^\s@]+@aloe\.ulima\.edu\.pe$/i.test(email)
export const nowTime = () => new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
export const firstName = name => name.split(' ')[0]

// Muestra errores de formulario y enfoca el primer campo inválido. Devuelve true si hay errores.
export function showErrors(err, setErr) {
  setErr(err)
  const first = Object.keys(err)[0]
  if (first) document.getElementById(first)?.focus()
  return Object.keys(err).length > 0
}
