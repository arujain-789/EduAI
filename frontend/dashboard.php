<?php
session_start();
if (!isset($_SESSION['serial'])) {
    header("Location: teacherlogin.html");
    exit();
}
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Teacher Dashboard</title>
    <link rel="stylesheet" href="profile.css">
</head>
<body>
    <div class="card">
        <div class="title">Teacher Profile</div>
        <div class="info">
        <div class="column"><label><strong>Name:</strong></label>
            <input type="text" id="name" value="<?php echo $_SESSION['username']; ?>" disabled>
        </div>
            <div class="column"><label><strong>Email:</strong></label>
            <input type="text" id="class" value="<?php echo $_SESSION['email']; ?>" disabled>
            </div>
            <div class="column"><label><strong>school</strong></label>
            <input type="text" id="age" value=" <?php echo $_SESSION['school']; ?>" disabled>
            </div>
        </div>
        <button class="btn" onclick="toggleEdit()">Edit</button>
        <button class="btn" onclick="saveData()">Save</button>
</div>
<a href="logout.php">Logout</a>
</body>
</html>
