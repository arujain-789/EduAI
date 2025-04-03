<?php
session_start();
if (!isset($_SESSION['serial'])) {
    header("Location: student-login.html");
    exit();
}
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Student Profile</title>
    <link rel="stylesheet" href="stuprofile.css">
</head>
<body>
<img src="Green Modern Abstract ball globe icons logo template (1) (1).png" class="logo">


<a href="profilepage.php"><img src="creative-cartoon-character-logo-template-vector.jpg" class=" logo1" ></a>

<div class="card">
<header class="greet">hello <?php echo $_SESSION['name']; ?> !</header>
    <div class="info">
            <a href="Assignmentscan.php" class="assign">Assignment scan</a>
            <a href="studentreport.php" class="assign">Student Report</a>

        </div>
       
</div>

</body>
</html>
