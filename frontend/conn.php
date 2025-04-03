<?php
if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $name = $_POST['name'];
    $school = $_POST['school'];
    $email = $_POST['email'];
    $password = $_POST['password'];
    $cnfpassword = $_POST['cnfpassword'];
    $section = $_POST['section'];
    $class = $_POST['class'];

    // Database connection
    $conn = new mysqli("34.47.230.235", "EduAI", "Arujain@789", "teacherdetails");

    if ($conn->connect_error) {
        die("Connection failed: " . $conn->connect_error);
    }

    // Check if email already exists
    $sql = "SELECT * FROM studentdetail WHERE email = ?";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param("s", $email);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result->num_rows > 0) {
        echo "<script>alert('Email already registered. Try logging in!'); window.location.href='teacherlogin.html';</script>";
        exit();
    }

    // Check if passwords match
    if ($password !== $cnfpassword) {
        echo "<script>alert('Passwords do not match!'); window.history.back();</script>";
        exit();
    }

    // Hash the password before storing it
    $hashed_password = password_hash($password, PASSWORD_DEFAULT);

    // Insert data into database
    $sql = "INSERT INTO studentdetail (name, class, school, email, password, section) VALUES (?, ?, ?, ?, ?, ?)";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param("ssssss", $name, $class, $school, $email, $password, $section);

    if ($stmt->execute()) {
        echo "<script>alert('Registration successful!'); window.location.href='student-login.html';</script>";
    } else {
        die("Error executing query: " . $stmt->error); // Shows the actual SQL error
    }
    

    // Close connections
    $stmt->close();
    $conn->close();
}
?>
