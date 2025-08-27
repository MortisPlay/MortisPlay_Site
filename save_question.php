<?php
header('Content-Type: application/json; charset=utf-8');

// Настройки подключения
$db_host = "localhost";
$db_name = "qa_db";
$db_user = "qa_user";
$db_pass = "MortisPlay32";

// Антиспам: минимальный интервал 30 секунд
session_start();
if (isset($_SESSION['last_submit']) && time() - $_SESSION['last_submit'] < 30) {
    echo json_encode(["success" => false, "error" => "Слишком часто отправляешь вопросы. Подожди немного."]);
    exit;
}

// Проверка данных
$nickname = trim($_POST['nickname'] ?? '');
$question = trim($_POST['question'] ?? '');
$date     = date("Y-m-d H:i:s");

if (empty($nickname) || empty($question)) {
    echo json_encode(["success" => false, "error" => "Заполните все поля."]);
    exit;
}
if (mb_strlen($nickname) > 50) {
    echo json_encode(["success" => false, "error" => "Никнейм слишком длинный."]);
    exit;
}
if (mb_strlen($question) > 500) {
    echo json_encode(["success" => false, "error" => "Вопрос слишком длинный (макс. 500 символов)."]);
    exit;
}

// Фильтрация HTML
$nickname = htmlspecialchars($nickname, ENT_QUOTES, 'UTF-8');
$question = htmlspecialchars($question, ENT_QUOTES, 'UTF-8');

// Сохранение в базу
try {
    $pdo = new PDO("mysql:host=$db_host;dbname=$db_name;charset=utf8mb4", $db_user, $db_pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $stmt = $pdo->prepare("INSERT INTO questions (nickname, question, date) VALUES (?, ?, ?)");
    $stmt->execute([$nickname, $question, $date]);

    $_SESSION['last_submit'] = time();

    echo json_encode(["success" => true, "message" => "Вопрос отправлен и ожидает модерации."]);
} catch (Exception $e) {
    echo json_encode(["success" => false, "error" => "Ошибка сервера: " . $e->getMessage()]);
}
?>
