<?php

session_start();
session_destroy();
echo "<script>
        alert('You have successfully logged out.');
        window.location.href = 'student-login.html';
      </script>";
exit();
?>
