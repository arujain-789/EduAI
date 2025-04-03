<?php
session_start();

// Database connection
$conn = new mysqli("34.47.230.235", "EduAI", "Arujain@789", "teacherdetails");
if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}

// Get user input safely
$email = trim($_POST['email']);
$password = $_POST['password'];

// Fetch user data from database
$sql = "SELECT * FROM studentdetail WHERE email = ?";
$stmt = $conn->prepare($sql);
$stmt->bind_param("s", $email);
$stmt->execute();
$result = $stmt->get_result();

// Check if user exists
if ($result->num_rows == 0) {
    echo "<script>alert('User not found! Please register.'); window.history.back();</script>";
    exit();
}

$row = $result->fetch_assoc();

// ✅ Direct password comparison (No Hashing)
if ($password === $row["password"]) {  
    // Store user details in session
    $_SESSION['serial'] = $row['serial'];
    $_SESSION['name'] = $row['name'];
    $_SESSION['email'] = $row['email'];
    $_SESSION['school'] = $row['school'];
    $_SESSION['class'] = $row['class'];
    $_SESSION['section'] = $row['section'];

    // ✅ Redirect without any output before header()
    header("Location: studentprofile.php");
    exit();
} else {
    echo "<script>alert('Incorrect password!'); window.history.back();</script>";
}

// Close connections
$stmt->close();
$conn->close();
?>
