import { Heading } from '../components/ui'

const MATRIX = [
  ['US01', 'Iniciar sesión con correo universitario', 'Login', 'Correo institucional + contraseña correcta; dominio inválido; contraseña incorrecta', 'Acceso al inicio según perfil o rechazo con mensaje', 'pp. 29, 48, 50'],
  ['US05', 'Buscar viajes disponibles', 'Inicio pasajero / búsqueda', 'Buscar Universidad de Lima; buscar Cusco', 'Listado coherente o mensaje sin viajes', 'pp. 29, 50'],
  ['US09', 'Publicar ruta básica', 'Publicar ruta (conductor)', 'Completar origen, destino, hora, asientos y punto en mapa; enviar formulario vacío', 'Registro visible o bloqueo con campos pendientes', 'pp. 29, 50'],
  ['US13', 'Chat básico entre usuarios', 'Detalle / conversaciones / chat', 'Abrir t1 participante; abrir t2 sin permiso', 'Canal de viaje activo solo para participantes', 'pp. 29, 50'],
  ['US17', 'Ver reputación de usuarios', 'Tarjetas / detalle / perfil', 'Consultar Andrea; consultar Valeria', 'Reputación visible o ausencia de calificaciones', 'pp. 29–30'],
  ['US21', 'Ver historial simple', 'Historial', 'Cuenta Gabriel; cuenta nueva sin registros', 'Lista de viajes del usuario o estado vacío', 'p. 29'],
  ['US02', 'Registro con correo institucional', 'Registro / OTP', 'Correo único; duplicado; dominio inválido; elegir pasajero o conductor (con vehículo); OTP correcto, incorrecto o vencido', 'Registro verificado simulado o rechazo', 'pp. 33, 48, 52'],
  ['US06', 'Ver detalles del viaje', 'Detalle', 'Seleccionar viaje; escenario no disponible', 'Conductor, ruta en mapa interactivo, hora, asientos, vehículo, paradas, precio', 'pp. 33, 49'],
  ['US10', 'Ver rutas publicadas', 'Panel conductor', 'Publicar ruta; consultar cuenta sin publicaciones', 'Solo rutas del conductor o estado vacío', 'p. 33'],
  ['US14', 'Enviar mensajes en chat', 'Chat', 'Enviar texto; simular respuesta; acceder sin permiso', 'Mensaje registrado y visible; envío restringido sin canal', 'p. 33; US13 p. 50'],
  ['US18', 'Sistema de calificaciones', 'Historial / modal', 'Pasajero califica conductor; conductor califica pasajero; intentar activo', 'Almacenar 1–5 y actualizar reputación; rechazar inválido o no finalizado', 'pp. 33, 49–50'],
  ['US22', 'Visualizar ahorro básico', 'Ahorro / Ganancias', 'Consultar con historial; cuenta nueva; terminar un viaje', 'Diferencia taxi − costo compartido; ingresos del conductor', 'pp. 33, 49'],
  ['EXT-1', 'Perfiles pasajero y conductor', 'Login / navegación', 'Entrar como Gabriel y como Andrea', 'Menú y pantallas distintas según el rol', 'Extensión R1.1'],
  ['EXT-2', 'Mapa interactivo del viaje', 'Detalle / Seguir viaje / Gestionar viaje', 'Abrir t1; iniciar viaje; simular recorrido; usar GPS', 'Ruta, paradas y posición del conductor en vivo', 'Extensión R1.1'],
  ['EXT-3', 'Terminar viaje al llegar', 'Gestionar viaje (conductor)', 'Intentar terminar antes de llegar; llegar y terminar', 'Botón bloqueado hasta llegar; viaje pasa a Finalizado e historial', 'Extensión R1.1'],
  ['EXT-4', 'Backend y base de datos', 'Toda la app', 'Abrir pasajero y conductor en dos dispositivos; reiniciar demo', 'Datos persistentes en Supabase y seguimiento en vivo entre dispositivos', 'Release 1.2'],
]

export default function Guide() {
  return (
    <>
      <Heading title="Guía de exposición y trazabilidad" hu="Release 1.2 · Sprint 1 + Sprint 2 + perfiles, mapa y backend" sub="Fuente principal: IS2.pdf. Referencia visual: informe anterior." />
      <div className="guide">
        <section className="card">
          <h2>1. Alcance analizado</h2>
          <p>IS2.pdf, pp. 7–8, 27–34 y 47–55: MVP de acceso, búsqueda, publicación, chat, reputación, historial y ahorro. Las doce historias listadas abajo, más extensiones (perfiles por rol, mapa interactivo, terminar viaje y backend).</p>
          <p>No se implementan edición de perfil, filtros avanzados, recomendaciones, edición o cancelación de rutas, notificaciones, validación administrativa de identidad, CO₂ ni historial detallado. "Cambiar perfil" existe solo para alternar entre pasajero y conductor en la exposición.</p>
          <p>OTP pertenece al registro US02 según p. 33. El chat exige participación en viaje activo o en curso (p. 50).</p>
        </section>
        <section className="card">
          <h2>2. Historias y pantallas mínimas</h2>
          <p><strong>Sprint 1:</strong> US01, US05, US09, US13, US17, US21.<br /><strong>Sprint 2:</strong> US02, US06, US10, US14, US18, US22.<br /><strong>Extensiones:</strong> EXT-1 perfiles, EXT-2 mapa, EXT-3 terminar viaje, EXT-4 backend Supabase.</p>
          <p><strong>Pasajero:</strong> buscar viajes, detalle con mapa, reservar asiento, Mis viajes, seguir viaje en vivo, chat, historial, ahorro, perfil.<br /><strong>Conductor:</strong> panel con rutas activas, publicar ruta con mapa, gestionar viaje (iniciar · simular/GPS · terminar), chat, historial, ganancias, perfil.</p>
        </section>
        <section className="card">
          <h2>3. Mapa de navegación</h2>
          <p>Login ↔ Registro (elige rol) → OTP → Login<br /><strong>Pasajero:</strong> Buscar → Detalle → Reservar → Seguir mi viaje → (Finalizado) → Calificar<br /><strong>Conductor:</strong> Panel → Publicar ruta → Panel → Gestionar viaje → Iniciar → Llegar → Terminar viaje → Historial / Ganancias<br />Navegación → Conversaciones → Chat · Perfil · Historial</p>
        </section>
        <section className="card">
          <h2>4. Datos mock coherentes</h2>
          <p>Pasajeros: Gabriel y Lucía Paredes. Conductores: Andrea Salazar, Diego Ríos y Valeria Torres. Todos ficticios, contraseña RutaFlex1!. Cinco viajes activos con coordenadas reales aproximadas de Lima, tres históricos, una conversación precargada. Gabriel participa en t1 (conductora Andrea).</p>
          <p>Históricos: taxi 24 / compartido 8; taxi 22 / compartido 7; taxi 20 / compartido 6. Ahorro inicial: S/ 45.00. Al terminar un viaje se calcula una tarifa de taxi estimada por distancia (mock).</p>
        </section>
        <section className="card">
          <h2>5. Arquitectura</h2>
          <p><strong>Frontend:</strong> React 18 + Vite. Vistas por rol, componentes reutilizables (tarjetas, mapa, modales) y un store con sincronización.<br /><strong>Backend:</strong> Supabase (PostgreSQL). Tablas usuarios, credenciales, viajes, mensajes y calificaciones; contraseñas cifradas con bcrypt; RLS de solo lectura; escrituras mediante funciones (rf_sync, rf_login, rf_reset) y Realtime para el seguimiento en vivo.</p>
          <p>Mapa: Leaflet + teselas de OpenStreetMap/CARTO; la ruta por calles se pide a OSRM y, si no responde, se dibuja una línea por las paradas. Sin Supabase la app funciona en modo local (localStorage).</p>
        </section>
        <section className="card">
          <h2>6. POR DEFINIR y límites</h2>
          <p>Lista completa de dominios institucionales; política de contraseña; longitud, vigencia y reintentos OTP; límite máximo de asientos; política de calificaciones repetidas; método productivo de tarifa taxi; pagos y comisiones del conductor; radio de llegada productivo (demo: 150 m con GPS).</p>
          <p>El recorrido se simula o usa el GPS del navegador. La autenticación es propia del prototipo (sin Supabase Auth); en producción se usaría Supabase Auth con OTP real por correo.</p>
        </section>
        <section className="card">
          <h2>7. Matriz final de trazabilidad</h2>
          <div className="tablewrap">
            <table>
              <thead><tr><th>HU</th><th>Pantalla</th><th>Interacción</th><th>Criterio demostrado</th><th>Fuente</th></tr></thead>
              <tbody>
                {MATRIX.map(r => (
                  <tr key={r[0]}><td><strong>{r[0]}</strong><br />{r[1]}</td><td>{r[2]}</td><td>{r[3]}</td><td>{r[4]}</td><td>{r[5]}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="card">
          <h2>8. Recorrido recomendado de exposición</h2>
          <p>1. Login incorrecto y luego <strong>Pasajero (Gabriel)</strong>.<br />2. Buscar Universidad de Lima y Cusco; abrir un viaje y ver la ruta en el mapa; reservar asiento.<br />3. Mis viajes → t1 → "Esperando a que Andrea inicie el viaje".<br />4. En otra pestaña o celular: <strong>Conductor (Andrea)</strong> → Panel → t1 → Iniciar viaje → Simular recorrido.<br />5. Volver a Gabriel: el auto avanza en vivo (Supabase Realtime).<br />6. Mostrar que "Terminar viaje" está bloqueado hasta llegar; al llegar, terminar viaje.<br />7. Gabriel ve "Viaje terminado" y califica a Andrea; revisar Ahorro (pasajero) y Ganancias (conductor).<br />8. Chat, reputación, publicar ruta con mapa y registro con elección de rol.</p>
        </section>
      </div>
    </>
  )
}
