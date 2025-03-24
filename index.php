<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Upload PDF for AI Summarization</title>
</head>
<body>
    <h2>Upload a PDF File</h2>
    <form action="upload.php" method="post" enctype="multipart/form-data">
        <input type="file" name="pdfFile" accept="application/pdf" required>
        <button type="submit">Upload & Summarize</button>
    </form>
</body>
</html>
