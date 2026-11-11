// URL base del backend PHP (ver .env.example). Sin ella la app funciona en modo local (localStorage).
export const apiUrl: string | undefined = import.meta.env.VITE_API_URL?.replace(/\/+$/, '') || undefined
export const cloudConfigured = Boolean(apiUrl)
// Modo exposición (VITE_DEMO=true): perfiles ficticios, laboratorio y guía de evidencias.
// Por defecto está apagado: el producto arranca con la base vacía.
export const demoMode = import.meta.env.VITE_DEMO === 'true'
