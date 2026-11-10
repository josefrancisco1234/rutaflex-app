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
                'usuarios' => 'SELECT id, seq, rol, nombre, email, vehiculo, puntuaciones, viajes_completados FROM usuarios',
                'viajes' => 'SELECT id, seq, conductor_id, origen, destino, hora, asientos, precio, estado, miembros, paradas, taxi, fecha, extra FROM viajes',
                'mensajes' => 'SELECT id, seq, viaje_id, remitente_id, texto, hora FROM mensajes',
                'calificaciones' => 'SELECT id, seq, viaje_id, de_id, para_id, puntuacion FROM calificaciones',
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
    // POST /api/sync  { p: { users, trips, messages, ratings } }
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
        $st->execute(['email' => mb_strtolower(trim($email))]);
        $row = $st->fetch();
        // Si el usuario no existe se verifica igual contra un hash para no delatar si el correo existe por tiempo de respuesta.
        $ok = password_verify($pass, $row['pass_hash'] ?? password_hash($pass, PASSWORD_BCRYPT));
        return json_encode($row && $ok ? $row['id'] : null, JSON_THROW_ON_ERROR);
    }

    // ------------------------------------------------------------------
    // POST /api/reset  { p: { users, trips, messages, ratings } }
    // Borra todo, carga los datos iniciales y sube la versión para que los clientes recarguen.
    // ------------------------------------------------------------------
    public function reset(array $in): string
    {
        $p = $this->payload($in);
        $this->transaction(function () use ($p) {
            foreach (['calificaciones', 'mensajes', 'viajes', 'credenciales', 'usuarios'] as $table) {
                $this->db->exec("DELETE FROM $table");
            }
            $this->upsertAll($p);
            $this->db->exec('UPDATE rf_meta SET version = version + 1 WHERE id = 1');
        });
        return 'null';
    }

    // ------------------------------------------------------------------
    // Internos
    // ------------------------------------------------------------------

    /** @return array{users:array,trips:array,messages:array,ratings:array} */
    private function payload(array $in): array
    {
        $p = $in['p'] ?? null;
        if (!is_array($p)) {
            throw new HttpError(400, 'Falta el campo p');
        }
        $out = [];
        foreach (['users', 'trips', 'messages', 'ratings'] as $k) {
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
    }

    private function upsertUsers(array $users): void
    {
        $user = $this->db->prepare(
            "INSERT INTO usuarios (id, rol, nombre, email, vehiculo, puntuaciones, viajes_completados)
             VALUES (:id, :rol, :nombre, :email, :vehiculo,
                     ARRAY(SELECT e::int FROM jsonb_array_elements_text(CAST(:scores AS jsonb)) AS e), :completed)
             ON CONFLICT (id) DO UPDATE SET
               rol = EXCLUDED.rol, nombre = EXCLUDED.nombre, email = EXCLUDED.email,
               vehiculo = EXCLUDED.vehiculo, puntuaciones = EXCLUDED.puntuaciones,
               viajes_completados = EXCLUDED.viajes_completados"
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
                'email' => mb_strtolower(trim($this->str($u, 'email'))),
                'vehiculo' => $this->optStr($u, 'car'),
                'scores' => json_encode(array_map('intval', $scores), JSON_THROW_ON_ERROR),
                'completed' => (int) ($u['completed'] ?? 0),
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
