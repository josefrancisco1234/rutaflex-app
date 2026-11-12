<?php
declare(strict_types=1);

namespace RutaFlex;

use PDO;
use PDOException;

final class HttpError extends \RuntimeException
{
    public function __construct(public readonly int $status, string $message)
    {
        parent::__construct($message);
    }
}

/** Endpoints del backend. Todos se invocan con POST y cuerpo JSON. */
final class Api
{
    // Roles que se pueden registrar desde la app. El rol admin solo se crea con bin/crear-admin.php
    // (o con los datos de la demo en modo exposición).
    private const ROLES = ['pasajero', 'conductor'];
    private const ALL_ROLES = ['pasajero', 'conductor', 'admin'];
    private const DRIVER_STATES = ['pendiente', 'aprobado', 'rechazado'];

    // Dominio institucional aceptado en el registro (el servidor lo valida, no solo el frontend).
    private const DOMAIN = '/^[^\s@]+@aloe\.ulima\.edu\.pe$/i';
    // Datos personales de extra que solo ven su dueño y los administradores.
    private const PRIVATE_EXTRA = ['phone', 'application', 'studentCode', 'reviewedBy', 'lastLogout'];
    // Campos de extra que solo escribe el servidor (endpoints validados); /api/sync no los puede cambiar.
    private const SERVER_EXTRA = ['phone', 'application', 'studentCode', 'verifiedAt', 'reviewedAt', 'reviewedBy', 'lastLogout'];

    private PDO $db;
    /** Usuario de la sesión actual (id, rol, email, estado_conductor, baneado) o null si no hay token. */
    private ?array $me = null;
    private ?string $tokenHash = null;

    public function __construct()
    {
        $this->db = Database::pdo();
    }

    // ------------------------------------------------------------------
    // Sesión: index.php llama a authenticate() con el token del header Authorization.
    // A partir de aquí el usuario sale del token, nunca de un id enviado en el cuerpo.
    // ------------------------------------------------------------------
    public function authenticate(?string $token): void
    {
        if ($token === null || $token === '') {
            return;
        }
        $hash = hash('sha256', $token);
        $st = $this->db->prepare(
            'SELECT u.id, u.rol, u.email, u.estado_conductor, u.baneado
             FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
             WHERE s.token_hash = :h AND s.expira_en > now()'
        );
        $st->execute(['h' => $hash]);
        $u = $st->fetch();
        if (!$u || $u['baneado']) {
            throw new HttpError(401, 'Tu sesión expiró. Inicia sesión de nuevo.');
        }
        $this->me = $u;
        $this->tokenHash = $hash;
    }

    /** Id del usuario autenticado; 401 si la petición no trae una sesión válida. */
    private function me(): string
    {
        if ($this->me === null) {
            throw new HttpError(401, 'Inicia sesión para continuar');
        }
        return $this->me['id'];
    }

    /**
     * Id del usuario que hace la acción. Si el cuerpo trae el campo (user, driver…) por compatibilidad,
     * debe coincidir con la sesión: nadie puede actuar en nombre de otro.
     */
    private function actor(array $in, string $field): string
    {
        $me = $this->me();
        if (isset($in[$field]) && $in[$field] !== $me) {
            throw new HttpError(403, 'No puedes actuar en nombre de otro usuario');
        }
        return $me;
    }

    private function isAdmin(): bool
    {
        return $this->me !== null && $this->me['rol'] === 'admin' && !$this->me['baneado'];
    }

    /** Crea una sesión nueva y devuelve el token (solo se guarda su hash). */
    private function newSession(string $userId): string
    {
        $token = bin2hex(random_bytes(32));
        $hours = max(1, (int) Config::get('SESSION_HOURS', '12'));
        $this->db->exec('DELETE FROM sesiones WHERE expira_en < now()');
        $st = $this->db->prepare(
            "INSERT INTO sesiones (token_hash, usuario_id, expira_en) VALUES (:h, :id, now() + make_interval(hours => :hours))"
        );
        $st->execute(['h' => hash('sha256', $token), 'id' => $userId, 'hours' => $hours]);
        return $token;
    }

    // ------------------------------------------------------------------
    // POST /api/data  { hash?: string }
    // Devuelve todos los datos como JSON. Si el cliente envía el hash de lo que ya tiene
    // y nada cambió, responde {"unchanged":true} (así el sondeo casi no consume).
    // ------------------------------------------------------------------
    public function data(array $in): string
    {
        $this->db->beginTransaction();
        try {
            $this->db->exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
            $version = (int) $this->db->query('SELECT version FROM rf_meta WHERE id = 1')->fetchColumn();
            // v: quién pregunta. Sin sesión, me es NULL y adm es false.
            $v = 'WITH v AS (SELECT CAST(:me AS text) AS me, CAST(:adm AS boolean) AS adm) ';
            $priv = "'{" . implode(',', self::PRIVATE_EXTRA) . "}'::text[]";
            $tables = [
                // Correo, datos personales y motivos solo para el propio usuario y los admins.
                'usuarios' => $v . "SELECT u.id, u.seq, u.rol, u.nombre,
                                      CASE WHEN u.id = v.me OR v.adm THEN u.email END AS email,
                                      u.vehiculo, u.puntuaciones, u.viajes_completados, u.verificado,
                                      CASE WHEN u.id = v.me OR v.adm THEN u.extra ELSE u.extra - $priv END AS extra,
                                      u.estado_conductor,
                                      CASE WHEN u.id = v.me OR v.adm THEN u.motivo_rechazo END AS motivo_rechazo,
                                      u.baneado,
                                      CASE WHEN u.id = v.me OR v.adm THEN u.motivo_baneo END AS motivo_baneo,
                                      u.creado_en
                               FROM usuarios u, v",
                // La posición en vivo y las ubicaciones compartidas solo las ven los participantes del viaje (US19).
                'viajes' => $v . "SELECT t.id, t.seq, t.conductor_id, t.origen, t.destino, t.hora, t.asientos, t.precio, t.estado,
                                    t.miembros, t.paradas, t.taxi, t.fecha,
                                    CASE WHEN v.me = t.conductor_id OR v.me = ANY(t.miembros) OR v.adm THEN t.extra
                                         ELSE t.extra - '{pos,shares,gps}'::text[] END AS extra
                             FROM viajes t, v",
                // Cada uno ve solo los chats de los viajes en los que participa (US13).
                'mensajes' => $v . "SELECT m.id, m.seq, m.viaje_id, m.remitente_id, m.texto, m.hora
                               FROM mensajes m, v
                               WHERE EXISTS (SELECT 1 FROM viajes t WHERE t.id = m.viaje_id
                                             AND (v.me = t.conductor_id OR v.me = ANY(t.miembros)))",
                'calificaciones' => 'SELECT id, seq, viaje_id, de_id, para_id, puntuacion FROM calificaciones',
                // Cada uno ve solo sus avisos.
                'notificaciones' => $v . "SELECT n.id, n.seq, n.usuario_id, n.tipo, n.texto, n.viaje_id, n.leida, n.creado_en
                                     FROM notificaciones n, v WHERE n.usuario_id = v.me",
            ];
            $params = ['me' => $this->me['id'] ?? null, 'adm' => $this->isAdmin() ? 'true' : 'false'];
            $parts = [];
            foreach ($tables as $name => $sql) {
                $agg = "SELECT coalesce(jsonb_agg(to_jsonb(t) - 'seq' ORDER BY t.seq), '[]'::jsonb) FROM ($sql) t";
                $st = $this->db->prepare($agg);
                $st->execute(str_contains($sql, ':me') ? $params : []);
                $parts[] = '"' . $name . '":' . $st->fetchColumn();
            }
            $this->db->commit();
        } catch (\Throwable $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            throw $e;
        }

        $body = '"version":' . $version . ',' . implode(',', $parts);
        $hash = md5($body);
        if (isset($in['hash']) && is_string($in['hash']) && hash_equals($hash, $in['hash'])) {
            return '{"unchanged":true}';
        }
        return '{"hash":"' . $hash . '",' . $body . '}';
    }

    // ------------------------------------------------------------------
    // POST /api/sync  { p: { users, trips, messages, ratings, notices } }
    // ------------------------------------------------------------------
    public function sync(array $in): string
    {
        $me = $this->me();
        if ($this->me['baneado']) {
            throw new HttpError(403, 'Tu cuenta está suspendida');
        }
        $p = $this->payload($in);
        $this->transaction(fn () => $this->syncAll($p, $me));
        return 'null';
    }

    // ------------------------------------------------------------------
    // POST /api/login  { email, pass }  →  "id-del-usuario" | null
    // ------------------------------------------------------------------
    public function login(array $in): string
    {
        $email = $in['email'] ?? null;
        $pass = $in['pass'] ?? null;
        if (!is_string($email) || !is_string($pass)) {
            throw new HttpError(400, 'email y pass son obligatorios');
        }
        $st = $this->db->prepare(
            'SELECT u.id, u.baneado, u.motivo_baneo, c.pass_hash FROM usuarios u JOIN credenciales c ON c.usuario_id = u.id WHERE u.email = :email LIMIT 1'
        );
        $st->execute(['email' => self::email($email)]);
        $row = $st->fetch();
        // Si el usuario no existe se verifica igual contra un hash para no delatar si el correo existe por tiempo de respuesta.
        $ok = password_verify($pass, $row['pass_hash'] ?? password_hash($pass, PASSWORD_BCRYPT));
        // Cuenta suspendida por un admin: solo se informa después de validar la contraseña.
        if ($row && $ok && $row['baneado']) {
            throw new HttpError(403, 'Tu cuenta fue suspendida por un administrador'
                . ($row['motivo_baneo'] ? '. Motivo: ' . $row['motivo_baneo'] : '') . '.');
        }
        if (!$row || !$ok) {
            return 'null';
        }
        return json_encode(['id' => $row['id'], 'token' => $this->newSession($row['id'])], JSON_THROW_ON_ERROR);
    }

    // ------------------------------------------------------------------
    // POST /api/register  { p: { name, email, pass, role, application?, phone? } }  →  true   · US02
    // Crea la cuenta en el servidor: valida el dominio institucional, guarda la contraseña con bcrypt
    // y deja a los conductores como "pendiente" hasta que un admin los apruebe.
    // ------------------------------------------------------------------
    public function register(array $in): string
    {
        $p = $in['p'] ?? null;
        if (!is_array($p)) {
            throw new HttpError(400, 'Falta el campo p');
        }
        $name = trim((string) ($p['name'] ?? ''));
        if (self::len($name) < 2 || self::len($name) > 60) {
            throw new HttpError(422, 'El nombre debe tener entre 2 y 60 caracteres');
        }
        $email = self::email((string) ($p['email'] ?? ''));
        if (!preg_match(self::DOMAIN, $email)) {
            throw new HttpError(422, 'Solo se admiten correos institucionales');
        }
        $pass = $p['pass'] ?? '';
        if (!is_string($pass) || strlen($pass) < 8 || strlen($pass) > 72) {
            throw new HttpError(422, 'La contraseña debe tener entre 8 y 72 caracteres');
        }
        $role = $p['role'] ?? '';
        if (!in_array($role, self::ROLES, true)) {
            throw new HttpError(422, 'Rol inválido');
        }
        $car = null;
        $extra = [];
        if ($role === 'conductor') {
            [$app, $phone] = self::application(($p['application'] ?? []) + ['phone' => $p['phone'] ?? '']);
            $car = $app['model'] . ' · ' . $app['plate'];
            $extra = ['phone' => $phone, 'application' => $app];
        }
        $id = 'u' . bin2hex(random_bytes(8));
        $this->transaction(function () use ($id, $role, $name, $email, $car, $extra, $pass) {
            $exists = $this->db->prepare('SELECT 1 FROM usuarios WHERE email = :email');
            $exists->execute(['email' => $email]);
            if ($exists->fetchColumn()) {
                throw new HttpError(409, 'Este correo ya está registrado');
            }
            $this->db->prepare(
                'INSERT INTO usuarios (id, rol, nombre, email, vehiculo, extra, estado_conductor)
                 VALUES (:id, :rol, :nombre, :email, :car, CAST(:extra AS jsonb), :status)'
            )->execute([
                'id' => $id, 'rol' => $role, 'nombre' => $name, 'email' => $email, 'car' => $car,
                'extra' => $extra === [] ? '{}' : json_encode($extra, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
                'status' => $role === 'conductor' ? 'pendiente' : null,
            ]);
            $this->db->prepare('INSERT INTO credenciales (usuario_id, pass_hash) VALUES (:id, :hash)')
                ->execute(['id' => $id, 'hash' => password_hash($pass, PASSWORD_BCRYPT)]);
        });
        return 'true';
    }

    // ------------------------------------------------------------------
    // POST /api/reset  { p: { users, trips, messages, ratings, notices } }
    // Borra todo, carga los datos iniciales y sube la versión para que los clientes recarguen.
    // ------------------------------------------------------------------
    public function reset(array $in): string
    {
        // Solo en modo exposición: en producción borraría todos los datos reales.
        if (Config::get('DEMO_MODE') !== 'true') {
            throw new HttpError(403, 'Reiniciar solo está disponible en modo exposición');
        }
        $p = $this->payload($in);
        $this->transaction(function () use ($p) {
            foreach (['notificaciones', 'calificaciones', 'mensajes', 'viajes', 'credenciales', 'usuarios'] as $table) {
                $this->db->exec("DELETE FROM $table");
            }
            $this->upsertAll($p, true);
            $this->db->exec('UPDATE rf_meta SET version = version + 1 WHERE id = 1');
        });
        return 'null';
    }

    // ==================================================================
    // Endpoints del Release 2 (Sprints 3 y 4). Validan las reglas en el servidor.
    // ==================================================================

    // POST /api/logout  { user }  →  true   · US03
    // La sesión del prototipo vive en el navegador; aquí se registra el cierre.
    public function logout(array $in): string
    {
        $id = $this->actor($in, 'user');
        // Se invalida el token en el servidor: aunque alguien lo hubiera copiado, deja de servir.
        $this->db->prepare('DELETE FROM sesiones WHERE token_hash = :h')->execute(['h' => $this->tokenHash]);
        $st = $this->db->prepare(
            "UPDATE usuarios SET extra = extra || jsonb_build_object('lastLogout', now()) WHERE id = :id"
        );
        $st->execute(['id' => $id]);
        return json_encode($st->rowCount() > 0);
    }

    // POST /api/profile  { user, p: { name, phone?, career?, bio?, zone?, prefTime?, car? } }  · US04
    // El correo y el rol no se pueden cambiar.
    public function profile(array $in): string
    {
        $id = $this->actor($in, 'user');
        $p = $in['p'] ?? null;
        if (!is_array($p)) {
            throw new HttpError(400, 'Falta el campo p');
        }
        $name = trim((string) ($p['name'] ?? ''));
        if (self::len($name) < 3 || self::len($name) > 60) {
            throw new HttpError(422, 'El nombre debe tener entre 3 y 60 caracteres');
        }
        $phone = trim((string) ($p['phone'] ?? ''));
        if ($phone !== '' && !preg_match('/^9\d{8}$/', $phone)) {
            throw new HttpError(422, 'Celular inválido');
        }
        $time = trim((string) ($p['prefTime'] ?? ''));
        if ($time !== '' && !preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $time)) {
            throw new HttpError(422, 'Hora habitual inválida');
        }
        $bio = trim((string) ($p['bio'] ?? ''));
        if (self::len($bio) > 160) {
            throw new HttpError(422, 'La presentación admite máximo 160 caracteres');
        }
        $u = $this->requireUser($id);
        $car = trim((string) ($p['car'] ?? ''));
        if ($u['rol'] === 'conductor' && $car === '') {
            throw new HttpError(422, 'Los conductores deben registrar su vehículo');
        }
        // Campos vacíos se eliminan de extra; los demás se reemplazan.
        $fields = ['phone' => $phone, 'career' => trim((string) ($p['career'] ?? '')), 'bio' => $bio,
                   'zone' => trim((string) ($p['zone'] ?? '')), 'prefTime' => $time];
        $set = array_filter($fields, fn ($v) => $v !== '');
        $drop = array_keys(array_diff_key($fields, $set));
        $st = $this->db->prepare(
            "UPDATE usuarios SET nombre = :name,
                    vehiculo = CASE WHEN rol = 'conductor' THEN :car ELSE vehiculo END,
                    extra = (extra - CAST(:drop AS text[])) || CAST(:set AS jsonb)
             WHERE id = :id"
        );
        $st->execute([
            'id' => $id, 'name' => $name, 'car' => $car,
            'drop' => '{' . implode(',', $drop) . '}',
            'set' => $set === [] ? '{}' : json_encode($set, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
        ]);
        return 'true';
    }

    // POST /api/verify  { user, code }  →  true   · US20
    // Valida el correo institucional y el código universitario de 8 dígitos; marca al usuario como verificado.
    public function verify(array $in): string
    {
        $id = $this->actor($in, 'user');
        $code = $this->str($in, 'code');
        if (!preg_match('/^\d{8}$/', $code)) {
            throw new HttpError(422, 'Código universitario inválido');
        }
        $u = $this->requireUser($id);
        if (!preg_match('/@aloe\.ulima\.edu\.pe$/i', $u['email'])) {
            throw new HttpError(422, 'La cuenta no usa un correo institucional');
        }
        $st = $this->db->prepare(
            "UPDATE usuarios SET verificado = true,
                    extra = extra || jsonb_build_object('studentCode', CAST(:code AS text), 'verifiedAt', to_char(now(), 'YYYY-MM-DD'))
             WHERE id = :id"
        );
        $st->execute(['id' => $id, 'code' => $code]);
        $this->notify([$id], 'viaje', 'Tu identidad fue verificada. Ahora tu perfil muestra la insignia ✔.', null);
        return 'true';
    }

    // POST /api/edit-trip  { trip, driver, p: { origin?, dest?, time?, seats?, price?, changes? } }  · US11 · US16
    // changes: resumen legible de lo que cambió ("hora 07:15 → 07:40, paradas") para el aviso a los pasajeros.
    public function editTrip(array $in): string
    {
        $tripId = $this->str($in, 'trip');
        $driver = $this->actor($in, 'driver');
        $p = $in['p'] ?? null;
        if (!is_array($p)) {
            throw new HttpError(400, 'Falta el campo p');
        }
        if (isset($p['time']) && (!is_string($p['time']) || !preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $p['time']))) {
            throw new HttpError(422, 'Hora inválida');
        }
        if (isset($p['seats']) && (!is_int($p['seats']) || $p['seats'] < 0 || $p['seats'] > 6)) {
            throw new HttpError(422, 'Asientos inválidos (0 a 6)');
        }
        if (isset($p['price']) && (!is_int($p['price']) && !is_float($p['price']) || $p['price'] < 0)) {
            throw new HttpError(422, 'Precio inválido');
        }
        $this->transaction(function () use ($tripId, $driver, $p) {
            $t = $this->lockOwnActiveTrip($tripId, $driver, 'editar');
            $st = $this->db->prepare(
                "UPDATE viajes SET
                   origen = coalesce(nullif(trim(CAST(:origin AS text)), ''), origen),
                   destino = coalesce(nullif(trim(CAST(:dest AS text)), ''), destino),
                   hora = coalesce(CAST(:time AS text), hora),
                   asientos = coalesce(CAST(:seats AS int), asientos),
                   precio = CASE WHEN CAST(:hasPrice AS boolean) THEN CAST(:price AS double precision) ELSE precio END,
                   actualizado_en = now()
                 WHERE id = :id"
            );
            $st->execute([
                'id' => $tripId,
                'origin' => $p['origin'] ?? null,
                'dest' => $p['dest'] ?? null,
                'time' => $p['time'] ?? null,
                'seats' => $p['seats'] ?? null,
                'hasPrice' => array_key_exists('price', $p) ? 'true' : 'false',
                'price' => $p['price'] ?? null,
            ]);
            $route = ($p['origin'] ?? $t['origen']) . ' → ' . ($p['dest'] ?? $t['destino']);
            $changes = is_string($p['changes'] ?? null) ? trim(substr($p['changes'], 0, 200)) : '';
            $passengers = array_values(array_filter($t['miembros'], fn ($m) => $m !== $driver));
            if ($passengers !== []) {
                $this->notify($passengers, 'viaje', "Tu viaje $route fue modificado" . ($changes !== '' ? ": $changes." : ' por el conductor.'), $tripId);
            }
        });
        return 'true';
    }

    // POST /api/cancel-trip  { trip, driver, reason }  · US12 · US16
    public function cancelTrip(array $in): string
    {
        $tripId = $this->str($in, 'trip');
        $driver = $this->actor($in, 'driver');
        $reason = trim($this->str($in, 'reason'));
        if (self::len($reason) > 120) {
            throw new HttpError(422, 'El motivo admite máximo 120 caracteres');
        }
        $this->transaction(function () use ($tripId, $driver, $reason) {
            $t = $this->lockOwnActiveTrip($tripId, $driver, 'cancelar');
            $st = $this->db->prepare(
                "UPDATE viajes SET estado = 'Cancelado',
                        extra = extra || jsonb_build_object('cancelReason', CAST(:reason AS text), 'cancelledAt', now()),
                        actualizado_en = now()
                 WHERE id = :id"
            );
            $st->execute(['id' => $tripId, 'reason' => $reason]);
            $route = $t['origen'] . ' → ' . $t['destino'] . ' (' . $t['hora'] . ')';
            $passengers = array_values(array_filter($t['miembros'], fn ($m) => $m !== $driver));
            $this->notify($passengers, 'viaje', "El viaje $route fue cancelado por el conductor. Motivo: $reason.", $tripId);
        });
        return 'true';
    }

    // POST /api/notifications  { user }  →  últimos 100 avisos del usuario   · US15 · US16
    public function notifications(array $in): string
    {
        $st = $this->db->prepare(
            "SELECT coalesce(jsonb_agg(to_jsonb(n) - 'seq' ORDER BY n.seq DESC), '[]'::jsonb)
             FROM (SELECT * FROM notificaciones WHERE usuario_id = :id ORDER BY seq DESC LIMIT 100) n"
        );
        $st->execute(['id' => $this->actor($in, 'user')]);
        return (string) $st->fetchColumn();
    }

    // POST /api/mark-read  { user }  →  cantidad marcada como leída   · US15 · US16
    public function markRead(array $in): string
    {
        $st = $this->db->prepare('UPDATE notificaciones SET leida = true WHERE usuario_id = :id AND NOT leida');
        $st->execute(['id' => $this->actor($in, 'user')]);
        return json_encode($st->rowCount());
    }

    // POST /api/co2  { user }  →  kg de CO₂ evitados   · US23
    // 0,192 kg CO₂ por km de auto a gasolina promedio; el conductor multiplica por sus pasajeros.
    public function co2(array $in): string
    {
        $st = $this->db->prepare(
            "SELECT coalesce(round(sum(coalesce((extra->>'km')::numeric, 0) * 0.192 *
                    CASE WHEN conductor_id = :id THEN greatest(cardinality(miembros) - 1, 0) ELSE 1 END), 2), 0)
             FROM viajes WHERE estado = 'Finalizado' AND :id2 = ANY(miembros)"
        );
        $id = $this->actor($in, 'user');
        $st->execute(['id' => $id, 'id2' => $id]);
        return json_encode((float) $st->fetchColumn());
    }

    // ==================================================================
    // Administración: revisión de solicitudes de conductor, suspensión y eliminación de cuentas.
    // Los endpoints admin-* reciben el id del administrador y el servidor comprueba su rol.
    // ==================================================================

    // POST /api/driver-apply  { user, p: { model, plate, license, soat, phone } }  →  true
    // Un conductor rechazado corrige su solicitud y la vuelve a enviar a revisión.
    public function driverApply(array $in): string
    {
        $id = $this->actor($in, 'user');
        $p = $in['p'] ?? null;
        if (!is_array($p)) {
            throw new HttpError(400, 'Falta el campo p');
        }
        [$app, $phone] = self::application($p);
        $this->transaction(function () use ($id, $app, $phone) {
            $u = $this->requireUser($id, true);
            if ($u['rol'] !== 'conductor') {
                throw new HttpError(403, 'Solo una cuenta de conductor puede enviar la solicitud');
            }
            if ($u['estado_conductor'] === 'aprobado') {
                throw new HttpError(409, 'Tu solicitud ya fue aprobada');
            }
            $st = $this->db->prepare(
                "UPDATE usuarios SET estado_conductor = 'pendiente', motivo_rechazo = NULL, vehiculo = :car,
                        extra = (extra - 'reviewedAt') || jsonb_build_object('phone', CAST(:phone AS text), 'application', CAST(:app AS jsonb))
                 WHERE id = :id"
            );
            $st->execute([
                'id' => $id,
                'car' => $app['model'] . ' · ' . $app['plate'],
                'phone' => $phone,
                'app' => json_encode($app, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
            ]);
        });
        return 'true';
    }

    // POST /api/admin-review  { admin, user, approve, reason? }  →  true
    // Aprueba o rechaza una solicitud pendiente. Rechazar exige un motivo, que se notifica al solicitante.
    public function adminReview(array $in): string
    {
        $admin = $this->requireAdmin($in);
        $id = $this->str($in, 'user');
        $approve = $in['approve'] ?? null;
        if (!is_bool($approve)) {
            throw new HttpError(400, 'Campo obligatorio inválido: approve');
        }
        $reason = trim((string) ($in['reason'] ?? ''));
        if (!$approve && (self::len($reason) < 5 || self::len($reason) > 300)) {
            throw new HttpError(422, 'Escribe el motivo del rechazo (entre 5 y 300 caracteres)');
        }
        $this->transaction(function () use ($admin, $id, $approve, $reason) {
            $u = $this->requireUser($id, true);
            if ($u['rol'] !== 'conductor' || $u['estado_conductor'] !== 'pendiente') {
                throw new HttpError(409, 'Esta solicitud ya fue revisada');
            }
            $st = $this->db->prepare(
                "UPDATE usuarios SET estado_conductor = :state, motivo_rechazo = :reason,
                        extra = extra || jsonb_build_object('reviewedAt', to_char(now(), 'YYYY-MM-DD HH24:MI'), 'reviewedBy', CAST(:admin AS text))
                 WHERE id = :id"
            );
            $st->execute([
                'id' => $id, 'admin' => $admin,
                'state' => $approve ? 'aprobado' : 'rechazado',
                'reason' => $approve ? null : $reason,
            ]);
            $this->notify([$id], 'cuenta', $approve
                ? '¡Tu solicitud de conductor fue aprobada! Ya puedes publicar tus rutas.'
                : "Tu solicitud de conductor fue rechazada. Motivo: $reason. Puedes corregir tus datos y enviarla de nuevo.", null);
        });
        return 'true';
    }

    // POST /api/admin-ban  { admin, user, ban, reason? }  →  true
    // Suspende (o reactiva) una cuenta. Al suspender se cancelan sus viajes por iniciar y se liberan sus asientos.
    public function adminBan(array $in): string
    {
        $admin = $this->requireAdmin($in);
        $id = $this->str($in, 'user');
        $ban = $in['ban'] ?? null;
        if (!is_bool($ban)) {
            throw new HttpError(400, 'Campo obligatorio inválido: ban');
        }
        $reason = trim((string) ($in['reason'] ?? ''));
        if ($ban && (self::len($reason) < 3 || self::len($reason) > 200)) {
            throw new HttpError(422, 'Escribe el motivo de la suspensión (entre 3 y 200 caracteres)');
        }
        if ($id === $admin) {
            throw new HttpError(422, 'No puedes suspender tu propia cuenta');
        }
        $this->transaction(function () use ($id, $ban, $reason) {
            $u = $this->requireUser($id, true);
            if ($u['rol'] === 'admin') {
                throw new HttpError(403, 'No se puede suspender a un administrador');
            }
            $st = $this->db->prepare('UPDATE usuarios SET baneado = :ban, motivo_baneo = :reason WHERE id = :id');
            $st->execute(['id' => $id, 'ban' => $ban ? 'true' : 'false', 'reason' => $ban ? $reason : null]);
            if ($ban) {
                // Cierra de inmediato todas sus sesiones abiertas.
                $this->db->prepare('DELETE FROM sesiones WHERE usuario_id = :id')->execute(['id' => $id]);
                $this->detachUser($id, 'suspendida');
            }
        });
        return 'true';
    }

    // POST /api/admin-delete  { admin, user }  →  true
    // Elimina la cuenta y todo lo suyo (viajes que conduce, mensajes, calificaciones y avisos).
    public function adminDelete(array $in): string
    {
        $admin = $this->requireAdmin($in);
        $id = $this->str($in, 'user');
        if ($id === $admin) {
            throw new HttpError(422, 'No puedes eliminar tu propia cuenta');
        }
        $this->transaction(function () use ($id) {
            $u = $this->requireUser($id, true);
            if ($u['rol'] === 'admin') {
                throw new HttpError(403, 'No se puede eliminar a un administrador');
            }
            $this->detachUser($id, 'eliminada');
            // Se quita de los viajes ajenos ya terminados para no dejar participantes inexistentes.
            $st = $this->db->prepare('UPDATE viajes SET miembros = array_remove(miembros, :id), actualizado_en = now() WHERE :id2 = ANY(miembros)');
            $st->execute(['id' => $id, 'id2' => $id]);
            $this->db->prepare('DELETE FROM usuarios WHERE id = :id')->execute(['id' => $id]);
            // Las bajas no viajan en el sondeo: subir la versión hace que todos los clientes recarguen.
            $this->db->exec('UPDATE rf_meta SET version = version + 1 WHERE id = 1');
        });
        return 'true';
    }

    // ------------------------------------------------------------------
    // Internos
    // ------------------------------------------------------------------

    /** @return array{users:array,trips:array,messages:array,ratings:array,notices:array} */
    private function payload(array $in): array
    {
        $p = $in['p'] ?? null;
        if (!is_array($p)) {
            throw new HttpError(400, 'Falta el campo p');
        }
        $out = [];
        foreach (['users', 'trips', 'messages', 'ratings', 'notices'] as $k) {
            $list = $p[$k] ?? [];
            if (!is_array($list) || !array_is_list($list)) {
                throw new HttpError(400, "p.$k debe ser una lista");
            }
            foreach ($list as $item) {
                if (!is_array($item)) {
                    throw new HttpError(400, "p.$k contiene un elemento inválido");
                }
            }
            $out[$k] = $list;
        }
        return $out;
    }

    private function transaction(callable $fn): void
    {
        $this->db->beginTransaction();
        try {
            $fn();
            $this->db->commit();
        } catch (PDOException $e) {
            $this->db->rollBack();
            // Clase 23 = violación de restricción (FK, CHECK, UNIQUE, NOT NULL): datos inválidos del cliente.
            if (str_starts_with((string) $e->getCode(), '23')) {
                throw new HttpError(422, 'Datos inválidos');
            }
            throw $e;
        } catch (\Throwable $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            throw $e;
        }
    }

    // ==================================================================
    // /api/sync con sesión: cada registro se acepta solo si le pertenece a quien inició sesión.
    // Lo que no le corresponde (perfiles ajenos, mensajes de otros…) se ignora en silencio,
    // para que el cliente no quede bloqueado reintentando; las reglas de negocio sí responden error.
    // ==================================================================
    private function syncAll(array $p, string $me): void
    {
        foreach ($p['users'] as $u) {
            $this->syncOwnUser($u, $me);
        }
        foreach ($p['trips'] as $t) {
            $this->syncTrip($t, $me);
        }
        foreach ($p['messages'] as $m) {
            $this->syncMessage($m, $me);
        }
        foreach ($p['ratings'] as $r) {
            $this->syncRating($r, $me);
        }
        foreach ($p['notices'] as $n) {
            $this->syncNotice($n, $me);
        }
    }

    /**
     * Solo el propio perfil, y solo nombre y preferencias. Correo, rol, contraseña, verificación,
     * reputación y viajes completados no se cambian por aquí (los calcula o valida el servidor).
     */
    private function syncOwnUser(array $u, string $me): void
    {
        if (($u['id'] ?? null) !== $me) {
            return;
        }
        $name = trim($this->str($u, 'name'));
        if (self::len($name) < 2 || self::len($name) > 60) {
            throw new HttpError(422, 'El nombre debe tener entre 2 y 60 caracteres');
        }
        $locked = '{' . implode(',', self::SERVER_EXTRA) . '}';
        $st = $this->db->prepare(
            "UPDATE usuarios SET nombre = :name,
                    extra = (CAST(:extra AS jsonb) - CAST(:locked AS text[]))
                            || coalesce((SELECT jsonb_object_agg(k, val) FROM jsonb_each(extra) AS e(k, val)
                                         WHERE k = ANY(CAST(:locked2 AS text[]))), '{}'::jsonb)
             WHERE id = :id"
        );
        $st->execute(['id' => $me, 'name' => $name, 'extra' => $this->jsonObj($u, 'extra'), 'locked' => $locked, 'locked2' => $locked]);
    }

    /** Ubicación compartida (US19): { p: [lat, lng], at: ms } o null. */
    private static function share(mixed $s): ?array
    {
        if (!is_array($s) || !isset($s['p']) || !is_array($s['p']) || count($s['p']) !== 2) {
            return null;
        }
        [$lat, $lng] = array_values($s['p']);
        if (!is_numeric($lat) || !is_numeric($lng) || abs((float) $lat) > 90 || abs((float) $lng) > 180) {
            return null;
        }
        return ['p' => [(float) $lat, (float) $lng], 'at' => (int) ($s['at'] ?? 0)];
    }

    /** Copia shares del servidor y reemplaza solo la entrada de $me con lo que mandó el cliente. */
    private static function mergeShares(array $dbExtra, array $clientExtra, string $me, bool $keepMine): array
    {
        $shares = is_array($dbExtra['shares'] ?? null) ? $dbExtra['shares'] : [];
        $mine = $keepMine ? self::share($clientExtra['shares'][$me] ?? null) : null;
        if ($mine) {
            $shares[$me] = $mine;
        } else {
            unset($shares[$me]);
        }
        return $shares;
    }

    /**
     * Viajes:
     *  - nuevo: solo lo publica un conductor aprobado, a su nombre, con él como único miembro;
     *  - del propio conductor: puede actualizarlo, pero no cambia pasajeros ni asientos libres
     *    (eso lo hacen las reservas y /api/edit-trip) ni reabre un viaje terminado;
     *  - ajeno: el pasajero solo puede reservar o cancelar su propio asiento y compartir su ubicación.
     */
    private function syncTrip(array $t, string $me): void
    {
        $id = $this->str($t, 'id');
        $members = $t['members'] ?? [];
        if (!is_array($members) || !array_is_list($members)) {
            throw new HttpError(400, 'members inválido');
        }
        $members = array_values(array_unique(array_map('strval', $members)));
        $extra = $t['extra'] ?? [];
        if (!is_array($extra)) {
            throw new HttpError(400, 'extra inválido');
        }
        $cur = $this->db->prepare(
            'SELECT conductor_id, estado, asientos, to_jsonb(miembros) AS miembros, extra FROM viajes WHERE id = :id FOR UPDATE'
        );
        $cur->execute(['id' => $id]);
        $old = $cur->fetch();

        if (!$old) {
            if (($t['driver'] ?? null) !== $me) {
                return;
            }
            if ($this->me['rol'] !== 'conductor' || $this->me['estado_conductor'] !== 'aprobado') {
                throw new HttpError(403, 'Solo los conductores aprobados por un administrador pueden publicar viajes');
            }
            if (($t['status'] ?? null) !== 'Activo') {
                throw new HttpError(422, 'Un viaje nuevo debe publicarse como Activo');
            }
            unset($extra['shares']);
            $this->writeTrip($t, $me, [$me], $extra);
            return;
        }

        $oldMembers = json_decode((string) $old['miembros'], true, 4, JSON_THROW_ON_ERROR);
        $oldExtra = json_decode((string) $old['extra'], true, 32, JSON_THROW_ON_ERROR) ?: [];

        if ($old['conductor_id'] === $me) {
            // Pasajeros y asientos libres los decide el servidor (reservas y cancelaciones de cada pasajero):
            // así una copia desactualizada del conductor no pisa una reserva recién hecha.
            $status = $this->str($t, 'status');
            if (in_array($old['estado'], ['Finalizado', 'Cancelado'], true) && $status !== $old['estado']) {
                throw new HttpError(409, 'Este viaje ya terminó y no se puede reabrir');
            }
            $extra['shares'] = self::mergeShares($oldExtra, $extra, $me, $status !== 'Finalizado');
            if ($extra['shares'] === []) {
                unset($extra['shares']);
            }
            $this->writeTrip($t, $me, $oldMembers, $extra, (int) $old['asientos']);
            // Viajes completados: los suma el servidor al terminar el viaje, no cada cliente.
            if ($status === 'Finalizado' && $old['estado'] !== 'Finalizado') {
                $this->db->prepare(
                    'UPDATE usuarios SET viajes_completados = viajes_completados + 1
                     WHERE id IN (SELECT jsonb_array_elements_text(CAST(:ids AS jsonb)))'
                )->execute(['ids' => json_encode($oldMembers, JSON_THROW_ON_ERROR)]);
            }
            return;
        }

        // Pasajero: solo su asiento y su ubicación compartida. El resto se toma del servidor.
        $was = in_array($me, $oldMembers, true);
        $now = in_array($me, $members, true);
        $newMembers = $oldMembers;
        $seats = (int) $old['asientos'];
        if (!$was && $now) {
            if ($this->me['rol'] !== 'pasajero') {
                throw new HttpError(403, 'Solo los pasajeros pueden reservar asientos');
            }
            if ($old['estado'] !== 'Activo' || $seats < 1) {
                throw new HttpError(409, 'Este viaje ya no tiene asientos disponibles');
            }
            $newMembers[] = $me;
            $seats--;
        } elseif ($was && !$now) {
            if ($old['estado'] !== 'Activo') {
                throw new HttpError(409, 'Solo puedes cancelar tu reserva antes de que el viaje inicie');
            }
            $newMembers = array_values(array_diff($oldMembers, [$me]));
            $seats++;
        } elseif (!$was) {
            return;
        }
        $shares = self::mergeShares($oldExtra, $extra, $me, $now);
        $st = $this->db->prepare(
            "UPDATE viajes SET miembros = ARRAY(SELECT jsonb_array_elements_text(CAST(:members AS jsonb))),
                    asientos = :seats,
                    extra = CASE WHEN CAST(:shares AS jsonb) = '{}'::jsonb THEN extra - 'shares'
                                 ELSE jsonb_set(extra, '{shares}', CAST(:shares2 AS jsonb)) END,
                    actualizado_en = now()
             WHERE id = :id"
        );
        $sharesJson = json_encode((object) $shares, JSON_THROW_ON_ERROR);
        $st->execute([
            'id' => $id, 'seats' => $seats, 'shares' => $sharesJson, 'shares2' => $sharesJson,
            'members' => json_encode(array_values($newMembers), JSON_THROW_ON_ERROR),
        ]);
    }

    /** Inserta o actualiza un viaje del conductor $driver con los datos validados. */
    private function writeTrip(array $t, string $driver, array $members, array $extra, ?int $seats = null): void
    {
        $stops = $t['stops'] ?? null;
        if ($stops !== null && (!is_array($stops) || !array_is_list($stops))) {
            throw new HttpError(400, 'stops inválido');
        }
        $seats ??= $this->int($t, 'seats');
        if ($seats < 0 || $seats > 6) {
            throw new HttpError(422, 'Asientos inválidos (0 a 6)');
        }
        $stopsJson = $stops === null ? null : json_encode(array_map('strval', $stops), JSON_THROW_ON_ERROR);
        $st = $this->db->prepare(
            "INSERT INTO viajes (id, conductor_id, origen, destino, hora, asientos, precio, estado,
                                 miembros, paradas, taxi, fecha, extra, actualizado_en)
             VALUES (:id, :driver, :origin, :dest, :time, :seats, :price, :status,
                     ARRAY(SELECT jsonb_array_elements_text(CAST(:members AS jsonb))),
                     CASE WHEN CAST(:stops AS jsonb) IS NULL THEN NULL
                          ELSE ARRAY(SELECT jsonb_array_elements_text(CAST(:stops2 AS jsonb))) END,
                     :taxi, :fecha, CAST(:extra AS jsonb), now())
             ON CONFLICT (id) DO UPDATE SET
               origen = EXCLUDED.origen, destino = EXCLUDED.destino, hora = EXCLUDED.hora,
               asientos = EXCLUDED.asientos, precio = EXCLUDED.precio, estado = EXCLUDED.estado,
               miembros = EXCLUDED.miembros, paradas = EXCLUDED.paradas, taxi = EXCLUDED.taxi,
               fecha = EXCLUDED.fecha, extra = EXCLUDED.extra, actualizado_en = now()
             WHERE viajes.conductor_id = EXCLUDED.conductor_id"
        );
        $st->execute([
            'id' => $this->str($t, 'id'),
            'driver' => $driver,
            'origin' => $this->str($t, 'origin'),
            'dest' => $this->str($t, 'dest'),
            'time' => $this->str($t, 'time'),
            'seats' => $seats,
            'price' => $this->optNum($t, 'price'),
            'status' => $this->str($t, 'status'),
            'members' => json_encode(array_values($members), JSON_THROW_ON_ERROR),
            'stops' => $stopsJson,
            'stops2' => $stopsJson,
            'taxi' => $this->optNum($t, 'taxi'),
            'fecha' => $this->optStr($t, 'date'),
            'extra' => $extra === [] ? '{}' : json_encode($extra, JSON_THROW_ON_ERROR),
        ]);
    }

    /** ¿$user es el conductor o un miembro del viaje? Devuelve el conductor, o null si no participa. */
    private function participant(string $tripId, string $user): ?array
    {
        $st = $this->db->prepare(
            'SELECT conductor_id, estado, to_jsonb(miembros) AS miembros FROM viajes WHERE id = :id'
        );
        $st->execute(['id' => $tripId]);
        $t = $st->fetch();
        if (!$t) {
            return null;
        }
        $t['miembros'] = json_decode((string) $t['miembros'], true, 4, JSON_THROW_ON_ERROR);
        $t['in'] = $t['conductor_id'] === $user || in_array($user, $t['miembros'], true);
        return $t;
    }

    /** Mensajes: el remitente es siempre quien inició sesión y debe participar en el viaje (US13 · US14). */
    private function syncMessage(array $m, string $me): void
    {
        if (($m['sender'] ?? null) !== $me) {
            return;
        }
        $text = $this->str($m, 'text');
        if (self::len($text) > 1000) {
            throw new HttpError(422, 'El mensaje admite máximo 1000 caracteres');
        }
        $t = $this->participant($this->str($m, 'trip'), $me);
        if (!$t || !$t['in']) {
            return;
        }
        $this->db->prepare(
            'INSERT INTO mensajes (id, viaje_id, remitente_id, texto, hora)
             VALUES (:id, :trip, :sender, :text, :time)
             ON CONFLICT (id) DO UPDATE SET texto = EXCLUDED.texto, hora = EXCLUDED.hora
             WHERE mensajes.remitente_id = EXCLUDED.remitente_id'
        )->execute([
            'id' => $this->str($m, 'id'), 'trip' => $this->str($m, 'trip'), 'sender' => $me,
            'text' => $text, 'time' => $this->optStr($m, 'time'),
        ]);
    }

    /**
     * Calificaciones (US18): solo de quien inició sesión, sobre un viaje finalizado en el que ambos
     * participaron, una vez por persona. La reputación la actualiza el servidor.
     */
    private function syncRating(array $r, string $me): void
    {
        if (($r['from'] ?? null) !== $me) {
            return;
        }
        $to = $this->str($r, 'to');
        $tripId = $this->str($r, 'trip');
        $score = $this->int($r, 'score');
        if ($score < 1 || $score > 5) {
            throw new HttpError(422, 'La calificación debe estar entre 1 y 5');
        }
        $t = $this->participant($tripId, $me);
        if (!$t || !$t['in'] || $to === $me || $t['estado'] !== 'Finalizado'
            || !($t['conductor_id'] === $to || in_array($to, $t['miembros'], true))) {
            throw new HttpError(403, 'Calificación no permitida');
        }
        $dup = $this->db->prepare('SELECT 1 FROM calificaciones WHERE viaje_id = :t AND de_id = :f AND para_id = :to');
        $dup->execute(['t' => $tripId, 'f' => $me, 'to' => $to]);
        if ($dup->fetchColumn()) {
            return;
        }
        $ins = $this->db->prepare(
            'INSERT INTO calificaciones (id, viaje_id, de_id, para_id, puntuacion) VALUES (:id, :trip, :from, :to, :score)
             ON CONFLICT (id) DO NOTHING'
        );
        $ins->execute(['id' => $this->str($r, 'id'), 'trip' => $tripId, 'from' => $me, 'to' => $to, 'score' => $score]);
        if ($ins->rowCount() > 0) {
            $this->db->prepare('UPDATE usuarios SET puntuaciones = array_append(puntuaciones, :score) WHERE id = :id')
                ->execute(['score' => $score, 'id' => $to]);
        }
    }

    /**
     * Avisos creados por el cliente (US15 · US16): solo de tipo mensaje o viaje (los de "cuenta" los
     * crea únicamente el servidor por acciones de admin) y solo entre participantes del mismo viaje.
     * De un aviso existente, el destinatario solo puede marcarlo como leído.
     */
    private function syncNotice(array $n, string $me): void
    {
        $id = $this->str($n, 'id');
        $cur = $this->db->prepare('SELECT usuario_id FROM notificaciones WHERE id = :id');
        $cur->execute(['id' => $id]);
        $owner = $cur->fetchColumn();
        if ($owner !== false) {
            if ($owner === $me && !empty($n['read'])) {
                $this->db->prepare('UPDATE notificaciones SET leida = true WHERE id = :id')->execute(['id' => $id]);
            }
            return;
        }
        $kind = $this->str($n, 'kind');
        $to = $this->str($n, 'to');
        $text = $this->str($n, 'text');
        $tripId = $this->optStr($n, 'trip');
        if (!in_array($kind, ['mensaje', 'viaje'], true) || self::len($text) > 300) {
            return;
        }
        if ($to !== $me) {
            $t = $tripId === null ? null : $this->participant($tripId, $to);
            // El destinatario participa del viaje, y quien avisa también (o le avisa al conductor tras dejar el viaje).
            if (!$t || !$t['in'] || !($t['conductor_id'] === $me || in_array($me, $t['miembros'], true) || $t['conductor_id'] === $to)) {
                return;
            }
        }
        $this->db->prepare(
            "INSERT INTO notificaciones (id, usuario_id, tipo, texto, viaje_id, leida, creado_en)
             VALUES (:id, :to, :kind, :text, :trip, :read, now())
             ON CONFLICT (id) DO NOTHING"
        )->execute([
            'id' => $id, 'to' => $to, 'kind' => $kind, 'text' => $text, 'trip' => $tripId,
            'read' => $to === $me && !empty($n['read']) ? 'true' : 'false',
        ]);
    }

    /** $trusted: datos de la demo (POST /reset). Desde /sync el cliente no puede tocar los campos de administración. */
    private function upsertAll(array $p, bool $trusted): void
    {
        $this->upsertUsers($p['users'], $trusted);
        $this->upsertTrips($p['trips'], $trusted);
        $this->upsertMessages($p['messages']);
        $this->upsertRatings($p['ratings']);
        $this->upsertNotices($p['notices']);
    }

    private function upsertUsers(array $users, bool $trusted): void
    {
        // Rol, estado de la solicitud de conductor y suspensión solo los cambia un admin (endpoints admin-*).
        // Desde /sync se ignoran en cuentas existentes, y una cuenta nueva de conductor siempre entra como pendiente.
        $adminCols = $trusted
            ? 'rol = EXCLUDED.rol, estado_conductor = EXCLUDED.estado_conductor, motivo_rechazo = EXCLUDED.motivo_rechazo,
               baneado = EXCLUDED.baneado, motivo_baneo = EXCLUDED.motivo_baneo,'
            : '';
        $user = $this->db->prepare(
            "INSERT INTO usuarios (id, rol, nombre, email, vehiculo, puntuaciones, viajes_completados, verificado, extra,
                                   estado_conductor, motivo_rechazo, baneado, motivo_baneo)
             VALUES (:id, :rol, :nombre, :email, :vehiculo,
                     ARRAY(SELECT e::int FROM jsonb_array_elements_text(CAST(:scores AS jsonb)) AS e), :completed,
                     :verified, CAST(:extra AS jsonb), :driverStatus, :rejectReason, :banned, :banReason)
             ON CONFLICT (id) DO UPDATE SET $adminCols
               nombre = EXCLUDED.nombre, email = EXCLUDED.email,
               vehiculo = EXCLUDED.vehiculo, puntuaciones = EXCLUDED.puntuaciones,
               viajes_completados = EXCLUDED.viajes_completados,
               verificado = EXCLUDED.verificado, extra = EXCLUDED.extra"
        );
        $cred = $this->db->prepare(
            'INSERT INTO credenciales (usuario_id, pass_hash) VALUES (:id, :hash)
             ON CONFLICT (usuario_id) DO UPDATE SET pass_hash = EXCLUDED.pass_hash'
        );
        foreach ($users as $u) {
            $role = $this->str($u, 'role');
            if (!in_array($role, $trusted ? self::ALL_ROLES : self::ROLES, true)) {
                throw new HttpError(400, 'Rol inválido');
            }
            $id = $this->str($u, 'id');
            $scores = $u['scores'] ?? [];
            if (!is_array($scores) || !array_is_list($scores)) {
                throw new HttpError(400, 'scores inválido');
            }
            if ($trusted) {
                $status = $role === 'conductor' ? ($this->optStr($u, 'driverStatus') ?? 'aprobado') : null;
                if ($status !== null && !in_array($status, self::DRIVER_STATES, true)) {
                    throw new HttpError(400, 'Estado de conductor inválido');
                }
                $admin = [
                    'driverStatus' => $status,
                    'rejectReason' => $this->optStr($u, 'rejectReason'),
                    'banned' => !empty($u['banned']) ? 'true' : 'false',
                    'banReason' => $this->optStr($u, 'banReason'),
                ];
            } else {
                $admin = ['driverStatus' => $role === 'conductor' ? 'pendiente' : null, 'rejectReason' => null, 'banned' => 'false', 'banReason' => null];
            }
            $user->execute([
                'id' => $id,
                'rol' => $role,
                'nombre' => $this->str($u, 'name'),
                'email' => self::email($this->str($u, 'email')),
                'vehiculo' => $this->optStr($u, 'car'),
                'scores' => json_encode(array_map('intval', $scores), JSON_THROW_ON_ERROR),
                'completed' => (int) ($u['completed'] ?? 0),
                'verified' => !empty($u['verified']) ? 'true' : 'false',
                'extra' => $this->jsonObj($u, 'extra'),
            ] + $admin);
            $pass = $u['pass'] ?? '';
            if (is_string($pass) && $pass !== '') {
                $cred->execute(['id' => $id, 'hash' => password_hash($pass, PASSWORD_BCRYPT)]);
            }
        }
    }

    private function upsertTrips(array $trips, bool $trusted): void
    {
        // Un viaje nuevo solo lo puede publicar un conductor aprobado y no suspendido.
        $exists = $this->db->prepare('SELECT 1 FROM viajes WHERE id = :id');
        $canDrive = $this->db->prepare(
            "SELECT rol = 'conductor' AND estado_conductor = 'aprobado' AND NOT baneado FROM usuarios WHERE id = :id"
        );
        $st = $this->db->prepare(
            "INSERT INTO viajes (id, conductor_id, origen, destino, hora, asientos, precio, estado,
                                 miembros, paradas, taxi, fecha, extra, actualizado_en)
             VALUES (:id, :driver, :origin, :dest, :time, :seats, :price, :status,
                     ARRAY(SELECT jsonb_array_elements_text(CAST(:members AS jsonb))),
                     CASE WHEN CAST(:stops AS jsonb) IS NULL THEN NULL
                          ELSE ARRAY(SELECT jsonb_array_elements_text(CAST(:stops2 AS jsonb))) END,
                     :taxi, :fecha, CAST(:extra AS jsonb), now())
             ON CONFLICT (id) DO UPDATE SET
               conductor_id = EXCLUDED.conductor_id, origen = EXCLUDED.origen, destino = EXCLUDED.destino,
               hora = EXCLUDED.hora, asientos = EXCLUDED.asientos, precio = EXCLUDED.precio,
               estado = EXCLUDED.estado, miembros = EXCLUDED.miembros, paradas = EXCLUDED.paradas,
               taxi = EXCLUDED.taxi, fecha = EXCLUDED.fecha, extra = EXCLUDED.extra,
               actualizado_en = now()"
        );
        foreach ($trips as $t) {
            $members = $t['members'] ?? [];
            if (!is_array($members) || !array_is_list($members)) {
                throw new HttpError(400, 'members inválido');
            }
            $stops = $t['stops'] ?? null;
            if ($stops !== null && (!is_array($stops) || !array_is_list($stops))) {
                throw new HttpError(400, 'stops inválido');
            }
            $extra = $t['extra'] ?? [];
            if (!is_array($extra)) {
                throw new HttpError(400, 'extra inválido');
            }
            if (!$trusted) {
                $exists->execute(['id' => $this->str($t, 'id')]);
                if (!$exists->fetchColumn()) {
                    $canDrive->execute(['id' => $this->str($t, 'driver')]);
                    if ($canDrive->fetchColumn() !== true) {
                        throw new HttpError(403, 'Solo los conductores aprobados por un administrador pueden publicar viajes');
                    }
                }
            }
            $stopsJson = $stops === null ? null : json_encode(array_map('strval', $stops), JSON_THROW_ON_ERROR);
            $st->execute([
                'id' => $this->str($t, 'id'),
                'driver' => $this->str($t, 'driver'),
                'origin' => $this->str($t, 'origin'),
                'dest' => $this->str($t, 'dest'),
                'time' => $this->str($t, 'time'),
                'seats' => $this->int($t, 'seats'),
                'price' => $this->optNum($t, 'price'),
                'status' => $this->str($t, 'status'),
                'members' => json_encode(array_map('strval', $members), JSON_THROW_ON_ERROR),
                'stops' => $stopsJson,
                'stops2' => $stopsJson,
                'taxi' => $this->optNum($t, 'taxi'),
                'fecha' => $this->optStr($t, 'date'),
                'extra' => $extra === [] ? '{}' : json_encode($extra, JSON_THROW_ON_ERROR),
            ]);
        }
    }

    private function upsertMessages(array $messages): void
    {
        $st = $this->db->prepare(
            'INSERT INTO mensajes (id, viaje_id, remitente_id, texto, hora)
             VALUES (:id, :trip, :sender, :text, :time)
             ON CONFLICT (id) DO UPDATE SET texto = EXCLUDED.texto, hora = EXCLUDED.hora'
        );
        foreach ($messages as $m) {
            $st->execute([
                'id' => $this->str($m, 'id'),
                'trip' => $this->str($m, 'trip'),
                'sender' => $this->str($m, 'sender'),
                'text' => $this->str($m, 'text'),
                'time' => $this->optStr($m, 'time'),
            ]);
        }
    }

    private function upsertRatings(array $ratings): void
    {
        $st = $this->db->prepare(
            'INSERT INTO calificaciones (id, viaje_id, de_id, para_id, puntuacion)
             VALUES (:id, :trip, :from, :to, :score)
             ON CONFLICT (id) DO NOTHING'
        );
        foreach ($ratings as $r) {
            $st->execute([
                'id' => $this->str($r, 'id'),
                'trip' => $this->str($r, 'trip'),
                'from' => $this->str($r, 'from'),
                'to' => $this->str($r, 'to'),
                'score' => $this->int($r, 'score'),
            ]);
        }
    }

    private function upsertNotices(array $notices): void
    {
        $st = $this->db->prepare(
            "INSERT INTO notificaciones (id, usuario_id, tipo, texto, viaje_id, leida, creado_en)
             VALUES (:id, :to, :kind, :text, :trip, :read, coalesce(CAST(:at AS timestamptz), now()))
             ON CONFLICT (id) DO UPDATE SET leida = EXCLUDED.leida OR notificaciones.leida"
        );
        foreach ($notices as $n) {
            $kind = $this->str($n, 'kind');
            if (!in_array($kind, ['mensaje', 'viaje', 'cuenta'], true)) {
                throw new HttpError(400, 'Tipo de notificación inválido');
            }
            $st->execute([
                'id' => $this->str($n, 'id'),
                'to' => $this->str($n, 'to'),
                'kind' => $kind,
                'text' => $this->str($n, 'text'),
                'trip' => $this->optStr($n, 'trip'),
                'read' => !empty($n['read']) ? 'true' : 'false',
                'at' => $this->optStr($n, 'at'),
            ]);
        }
    }

    /** JSON de un objeto opcional (extra); siempre devuelve un objeto JSON. */
    private function jsonObj(array $a, string $k): string
    {
        $v = $a[$k] ?? [];
        if (!is_array($v) || ($v !== [] && array_is_list($v))) {
            throw new HttpError(400, "Campo inválido: $k");
        }
        return $v === [] ? '{}' : json_encode($v, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
    }

    /** Inserta un aviso para cada destinatario. */
    private function notify(array $to, string $kind, string $text, ?string $trip): void
    {
        $st = $this->db->prepare(
            'INSERT INTO notificaciones (id, usuario_id, tipo, texto, viaje_id) VALUES (:id, :to, :kind, :text, :trip)'
        );
        foreach (array_unique($to) as $id) {
            $st->execute(['id' => 'n' . bin2hex(random_bytes(8)), 'to' => $id, 'kind' => $kind, 'text' => $text, 'trip' => $trip]);
        }
    }

    /** Lee un viaje bloqueándolo para actualizarlo; valida conductor y estado Activo. */
    private function lockOwnActiveTrip(string $tripId, string $driver, string $action): array
    {
        $st = $this->db->prepare('SELECT id, conductor_id, origen, destino, hora, estado, to_jsonb(miembros) AS miembros FROM viajes WHERE id = :id FOR UPDATE');
        $st->execute(['id' => $tripId]);
        $t = $st->fetch();
        if (!$t) {
            throw new HttpError(404, 'Viaje no encontrado');
        }
        if ($t['conductor_id'] !== $driver) {
            throw new HttpError(403, "Solo el conductor puede $action su viaje");
        }
        if ($t['estado'] !== 'Activo') {
            throw new HttpError(409, "Solo se puede $action un viaje que todavía no ha iniciado");
        }
        $t['miembros'] = json_decode((string) $t['miembros'], true, 4, JSON_THROW_ON_ERROR);
        return $t;
    }

    /** Largo en caracteres UTF-8 sin depender de mbstring. */
    private static function len(string $s): int
    {
        return preg_match_all('/./su', $s);
    }

    /** $lock: bloquea la fila hasta el final de la transacción (para revisar y actualizar sin carreras). */
    private function requireUser(string $id, bool $lock = false): array
    {
        $st = $this->db->prepare(
            'SELECT id, rol, email, estado_conductor, baneado FROM usuarios WHERE id = :id' . ($lock ? ' FOR UPDATE' : '')
        );
        $st->execute(['id' => $id]);
        $u = $st->fetch();
        if (!$u) {
            throw new HttpError(404, 'Usuario no encontrado');
        }
        return $u;
    }

    /** Comprueba que quien hace la acción sea un administrador activo; devuelve su id. */
    private function requireAdmin(array $in): string
    {
        // El admin es quien inició sesión, no el id que venga en el cuerpo.
        $id = $this->actor($in, 'admin');
        if (!$this->isAdmin()) {
            throw new HttpError(403, 'Solo un administrador puede hacer esto');
        }
        return $id;
    }

    /**
     * Cuenta suspendida o eliminada: cancela los viajes por iniciar que conduce (avisando a sus pasajeros)
     * y libera los asientos que tenía reservados en viajes ajenos por iniciar.
     */
    private function detachUser(string $id, string $why): void
    {
        $st = $this->db->prepare(
            "SELECT id, origen, destino, hora, to_jsonb(miembros) AS miembros FROM viajes
             WHERE conductor_id = :id AND estado = 'Activo' FOR UPDATE"
        );
        $st->execute(['id' => $id]);
        $cancel = $this->db->prepare(
            "UPDATE viajes SET estado = 'Cancelado',
                    extra = extra || jsonb_build_object('cancelReason', CAST(:reason AS text), 'cancelledAt', now()),
                    actualizado_en = now()
             WHERE id = :id"
        );
        $reason = "la cuenta del conductor fue $why";
        foreach ($st->fetchAll() as $t) {
            $cancel->execute(['id' => $t['id'], 'reason' => ucfirst($reason)]);
            $members = json_decode((string) $t['miembros'], true, 4, JSON_THROW_ON_ERROR);
            $passengers = array_values(array_filter($members, fn ($m) => $m !== $id));
            $route = $t['origen'] . ' → ' . $t['destino'] . ' (' . $t['hora'] . ')';
            $this->notify($passengers, 'viaje', "El viaje $route fue cancelado porque $reason.", $t['id']);
        }
        $free = $this->db->prepare(
            "UPDATE viajes SET miembros = array_remove(miembros, :id), asientos = asientos + 1, actualizado_en = now()
             WHERE estado = 'Activo' AND conductor_id <> :id2 AND :id3 = ANY(miembros)"
        );
        $free->execute(['id' => $id, 'id2' => $id, 'id3' => $id]);
    }

    /**
     * Valida el formulario de solicitud de conductor.
     * @return array{0: array{model:string, plate:string, license:string, soat:string, submittedAt:string}, 1: string}
     */
    private static function application(array $p): array
    {
        $model = trim((string) ($p['model'] ?? ''));
        if (self::len($model) < 3 || self::len($model) > 60) {
            throw new HttpError(422, 'Describe el vehículo (marca, modelo y color) en 3 a 60 caracteres');
        }
        $plate = strtoupper(str_replace(' ', '', trim((string) ($p['plate'] ?? ''))));
        if (preg_match('/^([A-Z0-9]{3})(\d{3})$/', $plate, $m)) {
            $plate = $m[1] . '-' . $m[2];
        }
        if (!preg_match('/^[A-Z0-9]{3}-\d{3}$/', $plate)) {
            throw new HttpError(422, 'Placa inválida (formato ABC-123)');
        }
        $license = strtoupper(trim((string) ($p['license'] ?? '')));
        if (!preg_match('/^[A-Z]\d{8}$/', $license)) {
            throw new HttpError(422, 'Licencia de conducir inválida (una letra y 8 dígitos)');
        }
        $soat = trim((string) ($p['soat'] ?? ''));
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $soat) || $soat < date('Y-m-d')) {
            throw new HttpError(422, 'El SOAT debe estar vigente');
        }
        $phone = trim((string) ($p['phone'] ?? ''));
        if (!preg_match('/^9\d{8}$/', $phone)) {
            throw new HttpError(422, 'Celular inválido');
        }
        return [['model' => $model, 'plate' => $plate, 'license' => $license, 'soat' => $soat, 'submittedAt' => date('Y-m-d')], $phone];
    }

    /** Correo normalizado (minúsculas, sin espacios); igual en registro y en login. */
    private static function email(string $e): string
    {
        $e = trim($e);
        return function_exists('mb_strtolower') ? mb_strtolower($e) : strtolower($e);
    }

    // ---------- validación de campos ----------

    private function str(array $a, string $k): string
    {
        $v = $a[$k] ?? null;
        if (!is_string($v) || $v === '') {
            throw new HttpError(400, "Campo obligatorio inválido: $k");
        }
        return $v;
    }

    private function optStr(array $a, string $k): ?string
    {
        $v = $a[$k] ?? null;
        if ($v === null) {
            return null;
        }
        if (!is_string($v)) {
            throw new HttpError(400, "Campo inválido: $k");
        }
        return $v;
    }

    private function int(array $a, string $k): int
    {
        $v = $a[$k] ?? null;
        if (!is_int($v) && !(is_float($v) && floor($v) === $v)) {
            throw new HttpError(400, "Campo numérico inválido: $k");
        }
        return (int) $v;
    }

    private function optNum(array $a, string $k): int|float|null
    {
        $v = $a[$k] ?? null;
        if ($v === null) {
            return null;
        }
        if (!is_int($v) && !is_float($v)) {
            throw new HttpError(400, "Campo numérico inválido: $k");
        }
        return $v;
    }
}
