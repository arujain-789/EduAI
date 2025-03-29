<?php
session_start();

// Database connection
$conn = new mysqli("34.47.230.235", "EduAI", "Arujain@789", "teacherdetails");
if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}

// Get user input
$email = $_POST['email'];
$password = $_POST['password'];

// Debugging: Print user input
echo "DEBUG: Email entered - " . $email . "<br>";

// Fetch user data from database
$sql = "SELECT * FROM studentdetail WHERE email = ?";
$stmt = $conn->prepare($sql);
$stmt->bind_param("s", $email);
$stmt->execute();
$result = $stmt->get_result();

// Debugging: Check if any rows were returned
if ($result->num_rows == 0) {
    die("<script>alert('User not found! Please register.'); window.history.back();</script>");
}

$row = $result->fetch_assoc();

// Debugging: Print retrieved password
echo "DEBUG: Password in database - " . $row['password'] . "<br>";

// ✅ Directly compare passwords (since you're not using hashing)
if ($password === $row["password"]) {
    $_SESSION['serial'] = $row['serial'];
    $_SESSION['name'] = $row['name'];
    $_SESSION['email'] = $row['email'];
    $_SESSION['school'] = $row['school'];
    $_SESSION['class'] = $row['class'];
    $_SESSION['section'] = $row['section'];

    // Redirect to dashboard
    header("Location: studentprofile.php");
    exit();
} else {
    echo "<script>alert('Incorrect password!'); window.history.back();</script>";
}

// Close connections
$stmt->close();
$conn->close();
?>
