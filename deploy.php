<?php
$secret = "32"; // чтобы никто чужой не запускал
$signature = $_SERVER['HTTP_X_HUB_SIGNATURE'] ?? '';

if (!$signature) { http_response_code(403); exit; }

list($algo, $hash) = explode('=', $signature, 2);
$payload = file_get_contents('php://input');

if (hash_hmac($algo, $payload, $secret) !== $hash) {
    http_response_code(403);
    exit;
}

exec('/var/www/mortisplay.ru/deploy.sh 2>&1', $output);
echo implode("\n", $output);
