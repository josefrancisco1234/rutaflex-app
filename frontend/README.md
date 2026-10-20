# RutaFlex · Frontend (React + Vite)

## Ejecutar

```bash
npm install
npm run dev
```

Abre la URL que muestra la terminal (normalmente http://localhost:5173).

## Configuración

Copia `.env.example` como `.env` y completa los datos de tu proyecto
(Supabase → Project Settings → API). El `.env` no se sube al repositorio.

```
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxx   (key publishable, nunca la service_role)
```

Sin `.env`, o si el backend no responde, la app funciona igual en **modo local** (localStorage).
El estado se ve arriba a la derecha: "Supabase en línea" o "modo local".

## Estructura

```
src/
├── main.jsx            arranque + conexión a Supabase
├── App.jsx             layout, navegación por rol, modales, toasts
├── context.js          estado de sesión compartido
├── styles.css          estilos
├── data/seed.js        datos de demostración
├── lib/                utilidades, geometría, rutas OSRM, cliente Supabase
├── store/
│   ├── db.js           estado de datos (store)
│   └── cloud.js        sincronización con Supabase + tiempo real
├── components/         tarjetas, mapas Leaflet, modales, perfil, laboratorio demo
└── views/              Auth, Passenger, Driver, TripView, Chat, Account, Guide
```

## Build de producción

```bash
npm run build     # genera dist/
npm run preview   # sirve dist/ en local
```
