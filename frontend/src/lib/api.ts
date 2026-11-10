// URL base del backend PHP (ver .env.example). Sin ella la app funciona en modo local (localStorage).
export const apiUrl: string | undefined = import.meta.env.VITE_API_URL?.replace(/\/+$/, '') || undefined
export const cloudConfigured = Boolean(apiUrl)
