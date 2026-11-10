<?php
declare(strict_types=1);

namespace RutaFlex;

/** Configuración desde backend/.env; las variables de entorno reales tienen prioridad. */
final class Config
{
    /** @var array<string,string>|null */
    private static ?array $file = null;

    public static function get(string $key, string $default = ''): string
    {
        $env = getenv($key);
        if ($env !== false && $env !== '') {
            return $env;
        }
        return self::file()[$key] ?? $default;
    }

    /** @return array<string,string> */
    private static function file(): array
    {
        if (self::$file !== null) {
            return self::$file;
        }
        self::$file = [];
        $path = dirname(__DIR__) . '/.env';
        if (is_readable($path)) {
            foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
                $line = trim($line);
                if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) {
                    continue;
                }
                [$k, $v] = explode('=', $line, 2);
                self::$file[trim($k)] = trim(trim($v), "\"'");
            }
        }
        return self::$file;
    }
}
