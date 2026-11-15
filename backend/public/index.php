<?php
declare(strict_types=1);

// Punto de entrada. Todos los endpoints son POST con cuerpo JSON:
//   Release 1: /api/data  /api/sync  /api/login  /api/register  /api/reset
//   Release 2: /api/logout  /api/profile  /api/verify  /api/edit-trip  /api/cancel-trip
//              /api/notifications  /api/mark-read  /api/co2
//   Administración: /api/driver-apply  /api/admin-review  /api/admin-ban  /api/admin-delete
// Sesión: /api/login devuelve un token; las demás llamadas lo envían en el header
//   Authorization: Bearer <token>. El servidor obtiene al usuario del token, no del cuerpo.
// Desarrollo:  php -S localhost:8000 -t backend/public backend/public/index.php

require __DIR__ . '/../src/Config.php';
require __DIR__ . '/../src/Database.php';
require __DIR__ . '/../src/Api.php';

use RutaFlex\Api;
use RutaFlex\Config;
use RutaFlex\HttpError;

const MAX_BODY = 5 * 1024 * 1024;

function respond(int $status, string $body): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo $body;
    exit;
}

function fail(int $status, string $message): never
{
    respond($status, json_encode(['error' => $message], JSON_UNESCAPED_UNICODE));
}

// CORS: solo orígenes listados en CORS_ORIGIN (vacío = mismo origen).
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = array_filter(array_map('trim', explode(',', Config::get('CORS_ORIGIN'))));
if ($origin !== '' && (in_array('*', $allowed, true) || in_array($origin, $allowed, true))) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

set_exception_handler(function (Throwable $e): void {
    if ($e instanceof HttpError) {
        fail($e->status, $e->getMessage());
    }
    error_log('[rutaflex] ' . $e);
    fail(500, 'Error interno del servidor');
});

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
if (!preg_match('#/api/(data|sync|login|register|reset|logout|profile|verify|edit-trip|cancel-trip|notifications|mark-read|co2|driver-apply|admin-review|admin-ban|admin-delete)/?$#', $path, $m)) {
    fail(404, 'Endpoint no encontrado');
}
if ($method !== 'POST') {
    header('Allow: POST, OPTIONS');
    fail(405, 'Solo se permite POST');
}

$raw = file_get_contents('php://input', false, null, 0, MAX_BODY + 1);
if ($raw === false || strlen($raw) > MAX_BODY) {
    fail(413, 'Cuerpo demasiado grande');
}
$input = $raw === '' ? [] : json_decode($raw, true);
if (!is_array($input)) {
    fail(400, 'JSON inválido');
}

$api = new Api();
// Login, registro y el reinicio de la demo no usan sesión; todo lo demás identifica al usuario por su token.
if (!in_array($m[1], ['login', 'register', 'reset'], true)) {
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    $api->authenticate(preg_match('/^Bearer\s+([0-9a-f]{64})$/i', $auth, $t) ? strtolower($t[1]) : null);
}
respond(200, match ($m[1]) {
    'data' => $api->data($input),
    'sync' => $api->sync($input),
    'login' => $api->login($input),
    'register' => $api->register($input),
    'reset' => $api->reset($input),
    'logout' => $api->logout($input),
    'profile' => $api->profile($input),
    'verify' => $api->verify($input),
    'edit-trip' => $api->editTrip($input),
    'cancel-trip' => $api->cancelTrip($input),
    'notifications' => $api->notifications($input),
    'mark-read' => $api->markRead($input),
    'co2' => $api->co2($input),
    'driver-apply' => $api->driverApply($input),
    'admin-review' => $api->adminReview($input),
    'admin-ban' => $api->adminBan($input),
    'admin-delete' => $api->adminDelete($input),
});
