<?php
session_start();
ob_start();  // Start output buffering

// Secure Database Connection
$conn = new mysqli("34.47.230.235", "EduAI", "Arujain@789", "teacherdetails");

// Check connection
if ($conn->connect_error) {
    die("Database Connection Failed: " . $conn->connect_error);
}

// Get user input safely
$email = trim($_POST['email']);
$password = trim($_POST['password']);

// Fetch user data from database securely
$sql = "SELECT * FROM teacherdetails WHERE email = ?";
$stmt = $conn->prepare($sql);
$stmt->bind_param("s", $email);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows === 0) {
    echo "<script>alert('User not found! Please register.'); window.history.back();</script>";
    exit();
}

$row = $result->fetch_assoc();

// Secure password verification (if stored using password_hash)
if (password_verify($password, $row["password"])) {  
    $_SESSION['serial'] = $row['serial'];
    $_SESSION['username'] = $row['username'];
    $_SESSION['email'] = $row['email'];
    $_SESSION['school'] = $row['school'];

    // Redirect to dashboard
    header("Location: classlist.php");
    exit();
} else {
    echo "<script>alert('Incorrect password!'); window.history.back();</script>";
    exit();
}

// Close connections
$stmt->close();
$conn->close();
ob_end_flush();  // Flush output buffer
?>
