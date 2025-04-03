<?php
ob_start(); // Start output buffering
session_start();

if (!isset($_SESSION['serial'])) {
    header("Location: student-login.html");
    exit();
}

// Database Connection
$conn = new mysqli("34.47.230.235", "EduAI", "Arujain@789", "teacherdetails");

if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}

// Get Student ID and Class Code
$serial = $_SESSION['serial'];
$code = trim($_POST['code']); 

// Check if class code exists
$check_code_sql = "SELECT * FROM classdetails WHERE code = ?";
$stmt = $conn->prepare($check_code_sql);
$stmt->bind_param("i", $code);
$stmt->execute();
$stmt->store_result();

if ($stmt->num_rows > 0) {
    // Get the current list of codes
    $sql = "SELECT code FROM studentdetail WHERE serial = ?";
    $stmt2 = $conn->prepare($sql);
    $stmt2->bind_param("i", $serial);
    $stmt2->execute();
    $result = $stmt2->get_result();
    $student = $result->fetch_assoc();
    
    // Append new code if not already in list
    $existing_codes = explode(",", $student['code'] ?? '');
    if (!in_array($code, $existing_codes)) {
        $existing_codes[] = $code; // Add new code
    }
    
    // Convert array back to string
    $new_code_list = implode(",", $existing_codes);

    // Update student record
    $update_sql = "UPDATE studentdetail SET code = ? WHERE serial = ?";
    $stmt_update = $conn->prepare($update_sql);
    $stmt_update->bind_param("si", $new_code_list, $serial);

    if ($stmt_update->execute()) {
        header("Location: class-join.php"); // Redirect without echoing anything
        exit();
    } else {
        echo "Error updating record: " . $conn->error;
    }
} else {
    echo "Error: Class code '$code' not found!";
}

$stmt->close();
$conn->close();
ob_end_flush(); // Flush output buffer
?>
