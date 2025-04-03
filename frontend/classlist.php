<?php
// Check if the teacher is logged in
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

// Step 1: Get teacher's name using the serial key
$serial = $_SESSION['serial'];
$sqlTeacher = "SELECT username FROM teacherdetails WHERE serial = ?";
$stmtTeacher = $conn->prepare($sqlTeacher);

if (!$stmtTeacher) {
    die("Error preparing teacher query: " . $conn->error);
}

$stmtTeacher->bind_param("i", $serial);
$stmtTeacher->execute();
$resultTeacher = $stmtTeacher->get_result();

// Step 2: Check if teacher's name is found
if ($resultTeacher->num_rows == 0) {
    die("Error: Teacher not found in the database.");
}

$teacherData = $resultTeacher->fetch_assoc();
$teachername = $teacherData['username'];

// Step 3: Fetch class details for the logged-in teacher
$sql = "SELECT  * FROM classdetails WHERE teachername = ?";
$stmt = $conn->prepare($sql);

if (!$stmt) {
    die("Error preparing statement: " . $conn->error);
}

$stmt->bind_param("s", $teachername);
$stmt->execute();
$result = $stmt->get_result();
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
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
        }

        h1 { color: #333; margin-bottom: 20px; }
        table {
            width: 80%;
            max-width: 700px;
            border-collapse: collapse;
            background-color: #ffffff;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
            border-radius: 10px;
            overflow: hidden;
        }
        th, td {
            padding: 12px 15px;
            text-align: center;
            border: 1px solid #ddd;
        }
        th { background-color: #5c62c5; color: #fff; }
        tr:nth-child(even) { background-color: #f9f9f9; }
        .back-btn {
            margin-top: 20px;
            background-color: #60993E;
            color: #fff;
            border: none;
            padding: 10px 20px;
            border-radius: 8px;
            text-decoration: none;
            cursor: pointer;
            transition: background-color 0.3s ease;
        }
        .back-btn:hover { background-color: #4e7d32; }
    </style>
</head>
<body>
    <h1>Class List for <?php echo htmlspecialchars($teachername); ?></h1>

    <?php if ($result->num_rows > 0): ?>
        <table>
            <tr>
                <th>Class</th>
                <th>Section</th>
                <th>Subject</th>
                <th>Class Code</th>
                <th>Student list</th>
                <th>Document scan</th>
            </tr>
            <?php while ($row = $result->fetch_assoc()): ?>
                <tr>
                    <td><?php echo htmlspecialchars($row['class']); ?></td>
                    <td><?php echo htmlspecialchars($row['section']); ?></td>
                    <td><?php echo htmlspecialchars($row['subject']); ?></td>
                    <td><?php echo htmlspecialchars($row['code']); ?></td>
                    <td><a href="specificclass.php?code=<?php echo urlencode($row['code']); ?>">Click Here</a></td>
                    <td><a href="upload.html">Click Here</a></td>
                </tr>
            <?php endwhile; ?>
        </table>
    <?php else: ?>
        <p>No class details found for you.</p>
    <?php endif; ?>

    <a href="class.html" class="back-btn">Add New Class</a>
    <br>
    <a href="logout.php" class="back-btn" style="background-color: #d9534f;">Logout</a>

    <?php
    // Close the database connection
    $conn->close();
    ?>
</body>
</html>
