<?php
// Start session & check login
session_start();
if (!isset($_SESSION['serial'])) {
    header("Location: teacherlogin.html");
    exit();
}

// Database connection
$conn = new mysqli("34.47.230.235", "EduAI", "Arujain@789", "teacherdetails");

// Check if the connection is successful
if ($conn->connect_error) {
    die("Database connection failed: " . $conn->connect_error);
}

// Check if class code is in the URL
if (!isset($_GET['code']) || empty($_GET['code'])) {
    die("No class selected.");
}

$code = $_GET['code']; // Get class code from URL

// Fetch students in the selected class (Sorted by Name)
$sql = "SELECT name FROM studentdetail WHERE FIND_IN_SET(?, code) ORDER BY name ASC";
$stmt = $conn->prepare($sql);

if (!$stmt) {
    die("Error preparing student query: " . $conn->error);
}

$stmt->bind_param("s", $code);
$stmt->execute();
$result = $stmt->get_result();

?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Student List</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background-color: #f0f2f5;
            text-align: center;
            padding: 20px;
        }
        h1 { color: #333; }
        table {
            width: 60%;
            margin: auto;
            border-collapse: collapse;
            background: #fff;
            box-shadow: 0px 4px 10px rgba(0, 0, 0, 0.1);
            border-radius: 10px;
            overflow: hidden;
        }
        th, td {
            padding: 12px;
            border: 1px solid #ddd;
        }
        th {
            background-color: #5c62c5;
            color: white;
        }
        tr:nth-child(even) { background-color: #f9f9f9; }
        .back-btn {
            margin-top: 20px;
            display: inline-block;
            background-color: #60993E;
            color: #fff;
            padding: 10px 20px;
            border-radius: 8px;
            text-decoration: none;
        }
        .back-btn:hover { background-color: #4e7d32; }
    </style>
</head>
<body>
    <h1>Students in Class Code: <?php echo htmlspecialchars($code); ?></h1>

    <?php if ($result->num_rows > 0): ?>
        <table>
            <tr>
                <th>Roll No.</th>
                <th>Student Name</th>
            </tr>
            <?php 
            $roll_no = 1; // Start roll number from 1
            while ($row = $result->fetch_assoc()): ?>
                <tr>
                    <td><?php echo $roll_no++; ?></td>
                    <td><?php echo htmlspecialchars($row['name']); ?></td>
                </tr>
            <?php endwhile; ?>
        </table>
    <?php else: ?>
        <p>No students found in this class.</p>
    <?php endif; ?>

    <a href="teacher_dashboard.php" class="back-btn">Back to Dashboard</a>

</body>
</html>

<?php
// Close database connection
$stmt->close();
$conn->close();
?>
