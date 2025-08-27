<?php
header('Content-Type: application/json');

$db_host = "localhost";
$db_name = "qa_db";
$db_user = "qa_user";
$db_pass = "MortisPlay32"; 

try {
    $pdo = new PDO("mysql:host=$db_host;dbname=$db_name;charset=utf8mb4", $db_user, $db_pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (Exception $e) {
    echo json_encode(["success" => false, "error" => "Ошибка подключения к базе: " . $e->getMessage()]);
    exit;
}

// Получаем данные из POST
$nickname = trim($_POST['nickname'] ?? '');
$question = trim($_POST['question'] ?? '');
$date = $_POST['date'] ?? date('Y-m-d H:i:s');

// Проверка данных
if (empty($nickname) || empty($question)) {
    echo json_encode(["success" => false, "error" => "Заполните все поля"]);
    exit;
}

if (strlen($nickname) > 50 || strlen($question) > 1000) {
    echo json_encode(["success" => false, "error" => "Слишком длинные данные"]);
    exit;
}

// Простая защита от спама (лимит по IP)
$ip = $_SERVER['REMOTE_ADDR'];
$stmt = $pdo->prepare("SELECT COUNT(*) FROM questions WHERE ip_address = ? AND date > DATE_SUB(NOW(), INTERVAL 1 MINUTE)");
$stmt->execute([$ip]);
if ($stmt->fetchColumn() > 0) {
    echo json_encode(["success" => false, "error" => "Пожалуйста, подождите минуту перед отправкой нового вопроса"]);
    exit;
}

// Вставка в базу
$stmt = $pdo->prepare("INSERT INTO questions (nickname, question, date, approved, ip_address) VALUES (?, ?, ?, 0, ?)");
try {
    $stmt->execute([$nickname, $question, $date, $ip]);
    echo json_encode(["success" => true, "message" => "Вопрос отправлен на модерацию!"]);
} catch (Exception $e) {
    echo json_encode(["success" => false, "error" => "Ошибка при сохранении: " . $e->getMessage()]);
}
?>

