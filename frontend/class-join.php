<?php
session_start();
if (!isset($_SESSION['serial'])) {
    header("Location: student-login.html");
    exit();
}

// Database Connection
$conn = new mysqli("34.47.230.235", "EduAI", "Arujain@789", "teacherdetails");

if ($conn->connect_error) {
    die("Database connection failed: " . $conn->connect_error);
}

// Get Student Details
$serial = $_SESSION['serial'];
$sqlStudent = "SELECT name, code FROM studentdetail WHERE serial = ?";
$stmtStudent = $conn->prepare($sqlStudent);
$stmtStudent->bind_param("i", $serial);
$stmtStudent->execute();
$resultStudent = $stmtStudent->get_result();

if ($resultStudent->num_rows == 0) {
    die("Error: Student not found.");
}

$studentData = $resultStudent->fetch_assoc();
$studentName = $studentData['name'];
$classCodes = explode(",", $studentData['code']); // Convert stored codes to array

// Fetch all class details
$classDetails = [];
foreach ($classCodes as $classCode) {
    $sql = "SELECT * FROM classdetails WHERE code = ?";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param("i", $classCode);
    $stmt->execute();
    $result = $stmt->get_result();
    
    while ($row = $result->fetch_assoc()) {
        $classDetails[] = $row;
    }
}

// Close statements
$stmtStudent->close();
$stmt->close();
$conn->close();
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Class List</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background-color: #f0f2f5;
            text-align: center;
            margin: 20px;
        }
        table {
            width: 80%;
            margin: 20px auto;
            border-collapse: collapse;
            background: white;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        }
        th, td {
            padding: 10px;
            border: 1px solid #ddd;
        }
        th { background-color: #5c62c5; color: #fff; }
        .btn {
            display: inline-block;
            padding: 8px 12px;
            margin: 10px;
            background: #60993E;
            color: #fff;
            text-decoration: none;
            border-radius: 5px;
        }
        .btn:hover { background: #4e7d32; }
    </style>
</head>
<body>
    <h1>Class List for <?php echo htmlspecialchars($studentName); ?></h1>

    <?php if (!empty($classDetails)): ?>
        <table>
            <tr>
                <th>Teacher</th>
                <th>Class</th>
                <th>Section</th>
                <th>Subject</th>
                <th>Class Code</th>
                <th>Action</th>
            </tr>
            <?php foreach ($classDetails as $row): ?>
                <tr>
                    <td><?php echo htmlspecialchars($row['teachername']); ?></td>
                    <td><?php echo htmlspecialchars($row['class']); ?></td>
                    <td><?php echo htmlspecialchars($row['section']); ?></td>
                    <td><?php echo htmlspecialchars($row['subject']); ?></td>
                    <td><?php echo htmlspecialchars($row['code']); ?></td>
                    <td><a href="class-details.php?code=<?php echo urlencode($row['code']); ?>">View Details</a></td>
                </tr>
            <?php endforeach; ?>
        </table>
    <?php else: ?>
        <p>No class details found.</p>
    <?php endif; ?>

    <a href="stuclass.html" class="btn">Add New Class</a>
    <a href="stulogout.php" class="btn" style="background-color: #d9534f;">Logout</a>
</body>
</html>
