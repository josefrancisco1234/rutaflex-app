import { createContext, useContext } from 'react'

// Estado de sesión y navegación compartido por todas las vistas (lo provee App.jsx).
export const AppCtx = createContext(null)
export const useApp = () => useContext(AppCtx)
