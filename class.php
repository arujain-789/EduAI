<?php
session_start();
if (!isset($_SESSION['serial'])) {
    header("Location: teacherlogin.html");
    exit();
}

// Database connection
$conn = new mysqli("34.47.230.235", "EduAI", "Arujain@789", "teacherdetails");

if ($conn->connect_error) {
    die("Database connection failed: " . $conn->connect_error);
}

// Fetch teacher name using session serial
$serial = $_SESSION['serial'];
$sql = "SELECT username FROM teacherdetails WHERE serial = ?";
$stmt = $conn->prepare($sql);

if (!$stmt) {
    die("Error preparing teacher query: " . $conn->error);
}

$stmt->bind_param("i", $serial);
$stmt->execute();
$result = $stmt->get_result();
$teacherData = $result->fetch_assoc();

if (!$teacherData) {
    die("Error: Teacher not found.");
}
$randomNumber = rand(100000, 999999);


$teachername = $teacherData['username'];

// Collect data from the form
$class = isset($_POST['class']) ? $_POST['class'] : null;
$section = isset($_POST['section']) ? $_POST['section'] : null;
$subject = isset($_POST['subject']) ? $_POST['subject'] : null;

// Validation
if (!$class || !$section || !$subject) {
    die("Error: All fields are required.");
}

// Insert data into `classdetails`
$stmt = $conn->prepare("INSERT INTO classdetails (class, section, subject, teachername, code) VALUES (?, ?, ?, ?, ?)");

if (!$stmt) {
    die("Error preparing statement: " . $conn->error);
}

$stmt->bind_param("ssssi", $class, $section, $subject, $teachername, $randomNumber);

if ($stmt->execute()) {
    // ✅ Redirect to a success page
    header("Location: classlist.php");
    exit();
} else {
    echo "Error inserting data: " . $stmt->error;
}

$conn->close();
?>
