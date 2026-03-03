#!/usr/bin/env php
<?php
declare(strict_types=1);

/**
 * Forward-only WPForms DB extractor for HostGator cron.
 *
 * Reads new wp_wpforms_entries rows and POSTs them to the Apps Script DB sync endpoint.
 * Cursor advances only after a successful endpoint acknowledgment.
 */

function envRequired(string $key): string
{
    $value = getenv($key);
    if ($value === false || trim($value) === '') {
        fwrite(STDERR, "Missing required env: {$key}\n");
        exit(2);
    }
    return trim($value);
}

function envOptional(string $key, string $default): string
{
    $value = getenv($key);
    if ($value === false) {
        return $default;
    }
    $trimmed = trim($value);
    return $trimmed === '' ? $default : $trimmed;
}

function readCursor(string $cursorFile): int
{
    if (!is_file($cursorFile)) {
        return 0;
    }

    $contents = trim((string) file_get_contents($cursorFile));
    if ($contents === '' || !ctype_digit($contents)) {
        return 0;
    }

    return (int) $contents;
}

function writeCursor(string $cursorFile, int $cursor): void
{
    $dir = dirname($cursorFile);
    if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) {
        throw new RuntimeException("Unable to create cursor dir: {$dir}");
    }

    $tmp = $cursorFile . '.tmp';
    if (file_put_contents($tmp, (string) $cursor, LOCK_EX) === false) {
        throw new RuntimeException("Unable to write cursor temp file: {$tmp}");
    }

    if (!rename($tmp, $cursorFile)) {
        throw new RuntimeException("Unable to move cursor temp file into place: {$cursorFile}");
    }
}

function buildEntriesQuery(array $statuses): array
{
    $placeholders = implode(',', array_fill(0, count($statuses), '?'));
    $sql = <<<SQL
SELECT
  entry_id,
  form_id,
  status,
  date,
  date_modified,
  fields,
  meta
FROM wp_wpforms_entries
WHERE entry_id > ?
  AND status IN ({$placeholders})
ORDER BY entry_id ASC
LIMIT ?
SQL;

    return [$sql, $placeholders];
}

function parseJsonOrNull(?string $json)
{
    if ($json === null || trim($json) === '') {
        return null;
    }

    $decoded = json_decode($json, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        return null;
    }

    return $decoded;
}

function fetchEntries(mysqli $db, int $cursor, array $statuses, int $limit): array
{
    [$sql] = buildEntriesQuery($statuses);
    $stmt = $db->prepare($sql);
    if (!$stmt) {
        throw new RuntimeException('Failed to prepare SQL statement.');
    }

    $types = 'i' . str_repeat('s', count($statuses)) . 'i';
    $args = [$cursor];
    foreach ($statuses as $status) {
        $args[] = $status;
    }
    $args[] = $limit;

    $bindValues = [];
    foreach ($args as $index => $value) {
        $bindValues[$index] = $value;
    }

    $bindParams = [$types];
    foreach ($bindValues as $k => &$v) {
        $bindParams[] = &$v;
    }

    if (!call_user_func_array([$stmt, 'bind_param'], $bindParams)) {
        throw new RuntimeException('Failed to bind SQL params.');
    }

    if (!$stmt->execute()) {
        throw new RuntimeException('Failed to execute SQL query.');
    }

    $result = $stmt->get_result();
    if (!$result) {
        throw new RuntimeException('Failed to fetch SQL result set.');
    }

    $rows = [];
    while ($row = $result->fetch_assoc()) {
        $rows[] = [
            'entry_id' => (int) $row['entry_id'],
            'form_id' => (int) $row['form_id'],
            'status' => (string) $row['status'],
            'date' => (string) $row['date'],
            'date_modified' => (string) $row['date_modified'],
            'fields' => parseJsonOrNull($row['fields']),
            'meta' => parseJsonOrNull($row['meta']),
        ];
    }

    $stmt->close();
    return $rows;
}

function postPayload(string $url, array $payload, int $timeoutSeconds): array
{
    $json = json_encode($payload, JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        throw new RuntimeException('Failed to encode JSON payload.');
    }

    $ch = curl_init($url);
    if ($ch === false) {
        throw new RuntimeException('Failed to initialize curl.');
    }

    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS => $json,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => $timeoutSeconds,
        CURLOPT_TIMEOUT => $timeoutSeconds,
        CURLOPT_FAILONERROR => false,
    ]);

    $responseBody = curl_exec($ch);
    $curlErr = curl_error($ch);
    $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($responseBody === false) {
        throw new RuntimeException('HTTP call failed: ' . $curlErr);
    }

    $decoded = json_decode((string) $responseBody, true);
    if (!is_array($decoded)) {
        throw new RuntimeException('Endpoint returned non-JSON response.');
    }

    return [
        'http_code' => $httpCode,
        'body' => $decoded,
    ];
}

function main(array $argv): void
{
    $dryRun = in_array('--dry-run', $argv, true);

    $dbHost = envRequired('WPFORMS_DB_HOST');
    $dbPort = (int) envOptional('WPFORMS_DB_PORT', '3306');
    $dbName = envRequired('WPFORMS_DB_NAME');
    $dbUser = envRequired('WPFORMS_DB_USER');
    $dbPass = envRequired('WPFORMS_DB_PASSWORD');

    $statusAllowlist = array_values(array_filter(array_map('trim', explode(',', envOptional('WPFORMS_DB_STATUS_ALLOWLIST', 'completed,publish')))));
    if (count($statusAllowlist) === 0) {
        fwrite(STDERR, "WPFORMS_DB_STATUS_ALLOWLIST cannot be empty\n");
        exit(2);
    }

    $batchSize = (int) envOptional('WPFORMS_DB_BATCH_SIZE', '200');
    if ($batchSize < 1) {
        $batchSize = 200;
    }

    $cursorFile = envOptional('WPFORMS_DB_CURSOR_FILE', '/tmp/wpforms_db_forward_cursor.txt');
    $sourceName = envOptional('WPFORMS_DB_SOURCE_NAME', 'hostgator-wpforms-cron');

    $endpointUrl = envRequired('WPFORMS_APPS_SCRIPT_WEBAPP_URL');
    $syncToken = envRequired('WPFORMS_DB_SYNC_TOKEN');
    $httpTimeout = (int) envOptional('WPFORMS_SYNC_HTTP_TIMEOUT_SECONDS', '30');

    mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
    $db = new mysqli($dbHost, $dbUser, $dbPass, $dbName, $dbPort);
    $db->set_charset('utf8mb4');

    $cursor = readCursor($cursorFile);
    $rows = fetchEntries($db, $cursor, $statusAllowlist, $batchSize);

    if (count($rows) === 0) {
        echo json_encode([
            'ok' => true,
            'dry_run' => $dryRun,
            'message' => 'No new rows.',
            'cursor' => $cursor,
        ], JSON_UNESCAPED_SLASHES) . PHP_EOL;
        return;
    }

    $maxEntryId = $cursor;
    foreach ($rows as $row) {
        if ($row['entry_id'] > $maxEntryId) {
            $maxEntryId = $row['entry_id'];
        }
    }

    $payload = [
        'auth_token' => $syncToken,
        'source' => $sourceName,
        'sent_at_utc' => gmdate('c'),
        'rows' => $rows,
    ];

    if ($dryRun) {
        echo json_encode([
            'ok' => true,
            'dry_run' => true,
            'message' => 'Dry run: payload prepared but not sent.',
            'cursor_before' => $cursor,
            'cursor_after' => $maxEntryId,
            'rows' => count($rows),
        ], JSON_UNESCAPED_SLASHES) . PHP_EOL;
        return;
    }

    $response = postPayload($endpointUrl, $payload, $httpTimeout);
    $ok = isset($response['body']['ok']) && $response['body']['ok'] === true;
    if (!$ok) {
        $error = 'Unknown endpoint error';
        if (isset($response['body']['error']) && is_string($response['body']['error'])) {
            $error = $response['body']['error'];
        }

        throw new RuntimeException('Apps Script sync rejected payload: ' . $error);
    }

    writeCursor($cursorFile, $maxEntryId);

    $summary = isset($response['body']['summary']) && is_array($response['body']['summary'])
        ? $response['body']['summary']
        : [];

    echo json_encode([
        'ok' => true,
        'cursor_before' => $cursor,
        'cursor_after' => $maxEntryId,
        'rows_sent' => count($rows),
        'endpoint_http_code' => $response['http_code'],
        'endpoint_summary' => $summary,
    ], JSON_UNESCAPED_SLASHES) . PHP_EOL;
}

try {
    main($argv);
} catch (Throwable $e) {
    fwrite(STDERR, '[wpforms-db-forward-sync] ' . $e->getMessage() . PHP_EOL);
    exit(1);
}
