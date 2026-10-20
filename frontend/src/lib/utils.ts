export const money = (n: number) => 'S/ ' + Number(n).toFixed(2)
export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
export const institutional = (email: string) => /^[^\s@]+@aloe\.ulima\.edu\.pe$/i.test(email)
export const nowTime = () => new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
export const firstName = (name: string) => name.split(' ')[0]

// Errores de formulario por id de campo.
export type FormErrors = Record<string, string>

// Muestra errores de formulario y enfoca el primer campo inválido. Devuelve true si hay errores.
export function showErrors(err: FormErrors, setErr: (err: FormErrors) => void) {
  setErr(err)
  const first = Object.keys(err)[0]
  if (first) document.getElementById(first)?.focus()
  return Object.keys(err).length > 0
}
