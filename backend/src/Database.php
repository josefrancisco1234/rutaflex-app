<?php
declare(strict_types=1);

namespace RutaFlex;

use PDO;

final class Database
{
    private static ?PDO $pdo = null;

    public static function pdo(): PDO
    {
        if (self::$pdo === null) {
            $dsn = sprintf(
                'pgsql:host=%s;port=%s;dbname=%s',
                Config::get('DB_HOST', 'localhost'),
                Config::get('DB_PORT', '5432'),
                Config::get('DB_NAME', 'rutaflex')
            );
            self::$pdo = new PDO($dsn, Config::get('DB_USER', 'postgres'), Config::get('DB_PASS'), [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
        }
        return self::$pdo;
    }
}
