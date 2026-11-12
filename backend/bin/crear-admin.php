<?php
declare(strict_types=1);

// Crea (o actualiza) una cuenta de administrador. Desde la app nadie puede registrarse como admin.
// Uso:  php backend/bin/crear-admin.php <correo> "<nombre>" <contraseña>

require __DIR__ . '/../src/Config.php';
require __DIR__ . '/../src/Database.php';

use RutaFlex\Database;

if (PHP_SAPI !== 'cli') {
    exit(1);
}
[, $email, $name, $pass] = $argv + [null, '', '', ''];
$email = strtolower(trim((string) $email));
$name = trim((string) $name);
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $name === '' || strlen((string) $pass) < 8) {
    fwrite(STDERR, "Uso: php backend/bin/crear-admin.php <correo> \"<nombre>\" <contraseña de 8+ caracteres>\n");
    exit(1);
}

$db = Database::pdo();
$db->beginTransaction();
$st = $db->prepare('SELECT id FROM usuarios WHERE email = :email');
$st->execute(['email' => $email]);
$id = $st->fetchColumn() ?: 'admin-' . bin2hex(random_bytes(4));
$db->prepare(
    "INSERT INTO usuarios (id, rol, nombre, email) VALUES (:id, 'admin', :name, :email)
     ON CONFLICT (id) DO UPDATE SET rol = 'admin', nombre = EXCLUDED.nombre, estado_conductor = NULL, baneado = false, motivo_baneo = NULL"
)->execute(['id' => $id, 'name' => $name, 'email' => $email]);
$db->prepare(
    'INSERT INTO credenciales (usuario_id, pass_hash) VALUES (:id, :hash)
     ON CONFLICT (usuario_id) DO UPDATE SET pass_hash = EXCLUDED.pass_hash'
)->execute(['id' => $id, 'hash' => password_hash((string) $pass, PASSWORD_BCRYPT)]);
$db->commit();
echo "Administrador listo: $email ($id)\n";
