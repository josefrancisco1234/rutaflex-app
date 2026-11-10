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
  ['US03', 'Cerrar sesión', 'Encabezado', 'Cerrar sesión e intentar volver a una pantalla interna', 'Sesión eliminada; las pantallas protegidas redirigen al login', 'IS2 §4.3.1 · Sprint 3'],
  ['US07', 'Filtrar viajes (hora, destino)', 'Buscar viajes', 'Filtrar por destino, partida, rango horario y precio; rango inválido; sin coincidencias', 'Resultados que respetan los filtros o estado vacío', 'IS2 §4.3.1 · Sprint 3'],
  ['US11', 'Editar ruta publicada', 'Panel / Gestionar viaje → Editar', 'Andrea edita t1; otro conductor intenta editar; editar viaje en curso', 'Solo el conductor guarda cambios en rutas activas; pasajeros avisados', 'IS2 §4.3.1 · Sprint 3'],
  ['US15', 'Notificaciones de mensajes', 'Campana / Conversaciones / Chat', 'Andrea escribe a Gabriel en t1', 'Aviso emergente, contador sin leer y marca de leído al abrir el chat', 'IS2 §4.3.1 · Sprint 3'],
  ['US19', 'Compartir ubicación en tiempo real', 'Seguir / Gestionar viaje', 'Pasajero o conductor comparten su ubicación; dejar de compartir', 'Marcador 🧍 visible para los participantes mientras dura el viaje', 'IS2 §4.3.1 · Sprint 3'],
  ['US23', 'Ver CO₂ ahorrado', 'CO₂ / Ahorro / Historial', 'Consultar Gabriel; cuenta nueva; terminar un viaje', 'CO₂ = km × 0,192 kg/km (× pasajeros para el conductor) con detalle por viaje', 'IS2 §4.3.1 · Sprint 3'],
  ['US04', 'Editar perfil', 'Perfil → Editar perfil', 'Cambiar nombre, carrera, zona, hora y vehículo; nombre vacío; celular inválido', 'Cambios válidos guardados y visibles en el perfil', 'IS2 §4.3.2 · Sprint 4'],
  ['US08', 'Recomendaciones de viajes', 'Buscar viajes', 'Gabriel (Miraflores · 07:15); usar ubicación actual; perfil sin zona ni hora', 'Viajes sugeridos por cercanía y horario con % de coincidencia', 'IS2 §4.3.2 · Sprint 4'],
  ['US12', 'Cancelar viaje', 'Gestionar viaje → Cancelar', 'Conductor cancela con motivo; pasajero cancela su reserva; cancelar viaje en curso', 'Estado Cancelado, asiento liberado y aviso a los involucrados', 'IS2 §4.3.2 · Sprint 4'],
  ['US16', 'Notificaciones de viaje', 'Campana', 'Reservar, editar, iniciar, terminar y cancelar un viaje', 'Aviso a cada participante afectado por el cambio', 'IS2 §4.3.2 · Sprint 4'],
  ['US20', 'Validar identidad de usuario', 'Perfil → Validar identidad', 'Gabriel ingresa código universitario y código del correo (654321); código inválido', 'Usuario marcado como verificado con insignia ✔', 'IS2 §4.3.2 · Sprint 4'],
  ['US24', 'Historial detallado', 'Historial → Ver detalle', 'Abrir un viaje finalizado y uno cancelado; filtrar por estado', 'Fecha, ruta, horarios, distancia, costo, ahorro y CO₂ de cada viaje', 'IS2 §4.3.2 · Sprint 4'],
  ['EXT-4', 'Backend y base de datos', 'Toda la app', 'Abrir pasajero y conductor en dos dispositivos; reiniciar demo', 'Datos persistentes en PostgreSQL y seguimiento en vivo entre dispositivos', 'Release 1.2'],
]

export default function Guide() {
  return (
    <>
      <Heading title="Guía de exposición y trazabilidad" hu="Release 2 · Sprints 1–4 · producto completo" sub="Fuente principal: IS2.pdf (Release 1 §4.2 y Release 2 §4.3)." />
      <div className="guide">
        <section className="card">
          <h2>1. Alcance analizado</h2>
          <p><strong>Release 1 (MVP):</strong> acceso, búsqueda, publicación, chat, reputación, historial y ahorro (12 historias) más extensiones (perfiles por rol, mapa interactivo, terminar viaje y backend).</p>
          <p><strong>Release 2:</strong> cierre de sesión, edición de perfil, filtros, recomendaciones, edición y cancelación de rutas, notificaciones de mensajes y de viaje, ubicación compartida en tiempo real, validación de identidad, CO₂ ahorrado e historial detallado (12 historias). Las 24 historias del Product Backlog están implementadas.</p>
          <p>OTP pertenece al registro US02 según p. 33. El chat exige participación en viaje activo o en curso (p. 50).</p>
        </section>
        <section className="card">
          <h2>2. Historias y pantallas mínimas</h2>
          <p><strong>Sprint 1:</strong> US01, US05, US09, US13, US17, US21.<br /><strong>Sprint 2:</strong> US02, US06, US10, US14, US18, US22.<br /><strong>Sprint 3:</strong> US03, US07, US11, US15, US19, US23.<br /><strong>Sprint 4:</strong> US04, US08, US12, US16, US20, US24.<br /><strong>Extensiones:</strong> EXT-1 perfiles, EXT-2 mapa, EXT-3 terminar viaje, EXT-4 backend PHP + PostgreSQL.</p>
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
          <p><strong>Frontend:</strong> React 18 + TypeScript + Vite. Vistas por rol, componentes reutilizables (tarjetas, mapa, modales) y un store con sincronización.<br /><strong>Backend:</strong> PHP 8 + PostgreSQL. Tablas usuarios, credenciales, viajes, mensajes, calificaciones y notificaciones; contraseñas cifradas con bcrypt (password_hash); API con endpoints solo POST y sondeo cada 1,5 s para el seguimiento en vivo y los avisos.</p>
          <p><strong>Endpoints</strong> (POST <code>/api/&lt;endpoint&gt;</code> con cuerpo JSON): data, sync, login, reset (Release 1) · logout (US03), profile (US04), edit-trip (US11), cancel-trip (US12), notifications y mark-read (US15 · US16), verify (US20), co2 (US23). Requiere <code>frontend/.env</code> con VITE_API_URL; sin esa variable la app trabaja en modo local.</p>
          <p>Mapa: Leaflet + teselas de OpenStreetMap/CARTO; la ruta por calles se pide a OSRM y, si no responde, se dibuja una línea por las paradas. Sin backend la app funciona en modo local (localStorage).</p>
        </section>
        <section className="card">
          <h2>6. POR DEFINIR y límites</h2>
          <p>Lista completa de dominios institucionales; política de contraseña; longitud, vigencia y reintentos OTP; límite máximo de asientos; política de calificaciones repetidas; método productivo de tarifa taxi; pagos y comisiones del conductor; radio de llegada productivo (demo: 150 m con GPS).</p>
          <p>El recorrido se simula o usa el GPS del navegador. La autenticación es propia del prototipo (sesión propia del prototipo); en producción se usaría autenticación con OTP real por correo.</p>
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
          <p>1. Login incorrecto y luego <strong>Pasajero (Gabriel)</strong>.<br />2. Buscar Universidad de Lima y Cusco; abrir un viaje y ver la ruta en el mapa; reservar asiento.<br />3. Mis viajes → t1 → "Esperando a que Andrea inicie el viaje".<br />4. En otra pestaña o celular: <strong>Conductor (Andrea)</strong> → Panel → t1 → Iniciar viaje → Simular recorrido.<br />5. Volver a Gabriel: el auto avanza en vivo (sincronización con el servidor).<br />6. Mostrar que "Terminar viaje" está bloqueado hasta llegar; al llegar, terminar viaje.<br />7. Gabriel ve "Viaje terminado" y califica a Andrea; revisar Ahorro (pasajero) y Ganancias (conductor).<br />8. Chat, reputación, publicar ruta con mapa y registro con elección de rol.</p>
        </section>
      </div>
    </>
  )
}
