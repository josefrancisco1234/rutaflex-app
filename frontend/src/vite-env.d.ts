/// <reference types="vite/client" />

// Variables del .env (ver .env.example). Son opcionales: sin ellas la app funciona en modo local.
interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_DEMO?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
