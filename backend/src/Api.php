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
    private const ROLES = ['pasajero', 'conductor'];

    private PDO $db;

    public function __construct()
    {
        $this->db = Database::pdo();
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
            $tables = [
                'usuarios' => 'SELECT id, seq, rol, nombre, email, vehiculo, puntuaciones, viajes_completados, verificado, extra FROM usuarios',
                'viajes' => 'SELECT id, seq, conductor_id, origen, destino, hora, asientos, precio, estado, miembros, paradas, taxi, fecha, extra FROM viajes',
                'mensajes' => 'SELECT id, seq, viaje_id, remitente_id, texto, hora FROM mensajes',
                'calificaciones' => 'SELECT id, seq, viaje_id, de_id, para_id, puntuacion FROM calificaciones',
                'notificaciones' => 'SELECT id, seq, usuario_id, tipo, texto, viaje_id, leida, creado_en FROM notificaciones',
            ];
            $parts = [];
            foreach ($tables as $name => $sql) {
                $agg = "SELECT coalesce(jsonb_agg(to_jsonb(t) - 'seq' ORDER BY t.seq), '[]'::jsonb) FROM ($sql) t";
                $parts[] = '"' . $name . '":' . $this->db->query($agg)->fetchColumn();
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
        $p = $this->payload($in);
        $this->transaction(fn () => $this->upsertAll($p));
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
            'SELECT u.id, c.pass_hash FROM usuarios u JOIN credenciales c ON c.usuario_id = u.id WHERE u.email = :email LIMIT 1'
        );
        $st->execute(['email' => self::email($email)]);
        $row = $st->fetch();
        // Si el usuario no existe se verifica igual contra un hash para no delatar si el correo existe por tiempo de respuesta.
        $ok = password_verify($pass, $row['pass_hash'] ?? password_hash($pass, PASSWORD_BCRYPT));
        return json_encode($row && $ok ? $row['id'] : null, JSON_THROW_ON_ERROR);
    }

    // ------------------------------------------------------------------
    // POST /api/reset  { p: { users, trips, messages, ratings, notices } }
    // Borra todo, carga los datos iniciales y sube la versión para que los clientes recarguen.
    // ------------------------------------------------------------------
    public function reset(array $in): string
    {
        $p = $this->payload($in);
        $this->transaction(function () use ($p) {
            foreach (['notificaciones', 'calificaciones', 'mensajes', 'viajes', 'credenciales', 'usuarios'] as $table) {
                $this->db->exec("DELETE FROM $table");
            }
            $this->upsertAll($p);
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
        $st = $this->db->prepare(
            "UPDATE usuarios SET extra = extra || jsonb_build_object('lastLogout', now()) WHERE id = :id"
        );
        $st->execute(['id' => $this->str($in, 'user')]);
        return json_encode($st->rowCount() > 0);
    }

    // POST /api/profile  { user, p: { name, phone?, career?, bio?, zone?, prefTime?, car? } }  · US04
    // El correo y el rol no se pueden cambiar.
    public function profile(array $in): string
    {
        $id = $this->str($in, 'user');
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
        $id = $this->str($in, 'user');
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
        $driver = $this->str($in, 'driver');
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
        $driver = $this->str($in, 'driver');
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
        $st->execute(['id' => $this->str($in, 'user')]);
        return (string) $st->fetchColumn();
    }

    // POST /api/mark-read  { user }  →  cantidad marcada como leída   · US15 · US16
    public function markRead(array $in): string
    {
        $st = $this->db->prepare('UPDATE notificaciones SET leida = true WHERE usuario_id = :id AND NOT leida');
        $st->execute(['id' => $this->str($in, 'user')]);
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
        $id = $this->str($in, 'user');
        $st->execute(['id' => $id, 'id2' => $id]);
        return json_encode((float) $st->fetchColumn());
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

    private function upsertAll(array $p): void
    {
        $this->upsertUsers($p['users']);
        $this->upsertTrips($p['trips']);
        $this->upsertMessages($p['messages']);
        $this->upsertRatings($p['ratings']);
        $this->upsertNotices($p['notices']);
    }

    private function upsertUsers(array $users): void
    {
        $user = $this->db->prepare(
            "INSERT INTO usuarios (id, rol, nombre, email, vehiculo, puntuaciones, viajes_completados, verificado, extra)
             VALUES (:id, :rol, :nombre, :email, :vehiculo,
                     ARRAY(SELECT e::int FROM jsonb_array_elements_text(CAST(:scores AS jsonb)) AS e), :completed,
                     :verified, CAST(:extra AS jsonb))
             ON CONFLICT (id) DO UPDATE SET
               rol = EXCLUDED.rol, nombre = EXCLUDED.nombre, email = EXCLUDED.email,
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
            if (!in_array($role, self::ROLES, true)) {
                throw new HttpError(400, 'Rol inválido');
            }
            $id = $this->str($u, 'id');
            $scores = $u['scores'] ?? [];
            if (!is_array($scores) || !array_is_list($scores)) {
                throw new HttpError(400, 'scores inválido');
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
            ]);
            $pass = $u['pass'] ?? '';
            if (is_string($pass) && $pass !== '') {
                $cred->execute(['id' => $id, 'hash' => password_hash($pass, PASSWORD_BCRYPT)]);
            }
        }
    }

    private function upsertTrips(array $trips): void
    {
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
            if (!in_array($kind, ['mensaje', 'viaje'], true)) {
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

    private function requireUser(string $id): array
    {
        $st = $this->db->prepare('SELECT id, rol, email FROM usuarios WHERE id = :id');
        $st->execute(['id' => $id]);
        $u = $st->fetch();
        if (!$u) {
            throw new HttpError(404, 'Usuario no encontrado');
        }
        return $u;
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
