<?php
if ($_SERVER["REQUEST_METHOD"] == "POST" && isset($_FILES["pdfFile"])) {
    $uploadDir = "uploads/";
    $fileName = basename($_FILES["pdfFile"]["name"]);
    $targetFilePath = $uploadDir . $fileName;
    
    // Move the uploaded file to the uploads folder
    if (move_uploaded_file($_FILES["pdfFile"]["tmp_name"], $targetFilePath)) {
        // Call Node.js script with the uploaded file
        $output = shell_exec("node ai.js " . escapeshellarg($targetFilePath));
        echo "<h3>Summary:</h3><p>" . nl2br(htmlspecialchars($output)) . "</p>";
    } else {
        echo "Error uploading file.";
    }
} else {
    echo "Invalid request.";
}
?>
