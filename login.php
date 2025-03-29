<?php
session_start();
ob_start();  // Start output buffering to prevent header issues

// Database connection
$conn = new mysqli("34.47.230.235", "EduAI", "Arujain@789", "teacherdetails");

// Check connection
if ($conn->connect_error) {
    die("<script>alert('Database Connection Failed!'); window.history.back();</script>");
}

// Get user input
$email = trim($_POST['email']);
$password = trim($_POST['password']);

// Prevent SQL Injection
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

// ✅ Directly Compare Passwords (No Hashing)
if ($password === $row["password"]) {  
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
