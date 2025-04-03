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
    <link rel="stylesheet" href="profilepage.css">
</head>
<body>
<img src="Green Modern Abstract ball globe icons logo template (1) (1).png" class="logo">

    <div class="profile-card">
        <div class="profile-section">
            <header class="name">Student Profile</header>
        <div class="column"><label><strong>Name:</strong></label>
            <input type="text" id="name" value="<?php echo $_SESSION['name']; ?>" disabled class="input">
        </div>
            <div class="column"><label><strong>Email:</strong></label>
            <input type="text" id="class" value="<?php echo $_SESSION['email']; ?>" disabled class="input">
            </div>
            <div class="column"><label><strong>class:</strong></label>
            <input type="text" id="age" value=" <?php echo $_SESSION['class']; ?> <?php echo $_SESSION['section']; ?>" disabled class="input">
            </div>
            <div class="column"><label><strong>school:</strong></label>
            <input type="text" id="age" value=" <?php echo $_SESSION['school']; ?>" disabled class="input">
            </div>

        </div>
        <div class="btn">
        <a href="class-join.php" class="classbtn">My classroom</a>
        <a href="stulogout.php" class="classbtn" style="right:0px;">Logout</a>
    </div>
    </div>
</body>
</html>