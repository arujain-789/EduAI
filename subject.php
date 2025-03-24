<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EduFlow</title>
 <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
    }

    body {
      font-family: Arial, sans-serif;
      background-color: #adadff;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      padding-left: 20px; /* to ensure the left side padding for EduFlow */
    }

    .container {
      text-align: center;
      background-color: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
      width: 100%;
      max-width: 600px;
    }

    header h1 {
      font-size: 2.5rem;
      color: #1c1c1c;
      text-align: left;
    }

    main h2 {
      margin: 20px 0;
      font-size: 1.5rem;
      color: #0a195ad1;
    }

    .subject {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 15px;
      margin-bottom: 20px;
    }

    .subject-btn {
      padding: 10px;
      font-size: 1.2rem;
      background-color: #f0f0f0;
      border: 1px solid #ccc;
      border-radius: 5px;
      cursor: pointer;
      text-align: center;
      transition: background-color 0.3s;
    }

    .subject-btn:hover {
      background-color: #e0e0e0;
    }

    .subject-btn.selected {
      background-color: #5c62c5;
      color: whitesmoke;
    }

    .proceed-btn {
      padding: 10px 20px;
      font-size: 1.2rem;
      color: white;
      background-color: #60993E;
      border: none;
      border-radius: 5px;
      cursor: pointer;
    }

    .proceed-btn:hover {
      background-color: #45a049;
    }

    .logo {
      top: 10px;
      left: 10px;
      position: absolute;
      height: min-content;
      margin-left: 10px;
      margin-top: 10px;
      width: 100px;
    }
 </style>
</head>
<body>
    <img src="Green Modern Abstract ball globe icons logo template (1) (1).png" class="logo">
  <div class="container">
    

    <main>
      <h2>What subjects do you teach?</h2>
      
      <div class="subject">
        <div class="subject-btn" onclick="toggleSubject(this, 'Math')">Math</div>
        <div class="subject-btn" onclick="toggleSubject(this, 'Science')">Science</div>
        <div class="subject-btn" onclick="toggleSubject(this, 'English')">English</div>
        <div class="subject-btn" onclick="toggleSubject(this, 'History')">History</div>
        <div class="subject-btn" onclick="toggleSubject(this, 'Geography')">Geography</div>
        <div class="subject-btn" onclick="toggleSubject(this, 'Art')">Art</div>
        <div class="subject-btn" onclick="toggleSubject(this, 'Physics')">Physics</div>
        <div class="subject-btn" onclick="toggleSubject(this, 'Chemistry')">Chemistry</div>
        <div class="subject-btn" onclick="toggleSubject(this, 'Biology')">Biology</div>
        <div class="subject-btn" onclick="toggleSubject(this, 'Computer Science')">Computer Science</div>
        <div class="subject-btn" onclick="toggleSubject(this, 'Literature')">Literature</div>
      </div>

      <form id="subjectForm" action="connection.php" method="POST">
        <!-- Pass teacher details -->
        <input type="hidden" name="name" value="<?php echo htmlspecialchars($_POST['name']); ?>">
        <input type="hidden" name="email" value="<?php echo htmlspecialchars($_POST['email']); ?>">
        <input type="hidden" name="school" value="<?php echo htmlspecialchars($_POST['school']); ?>">
        <input type="hidden" name="password" value="<?php echo htmlspecialchars($_POST['password']); ?>">
        <input type="hidden" name="cnfpassword" value="<?php echo htmlspecialchars($_POST['cnfpassword']); ?>">
        <!-- Hidden field to store selected subjects -->
        <input type="hidden" id="selectedSubjects" name="subject">

        <button id="proceedBtn" class="proceed-btn" type="submit" style="display: none;">Submit</button>
    </form>
    </main>
  </div>

  <script>
        const selectedSubjects = [];

        function toggleSubject(button, subject) {
            const index = selectedSubjects.indexOf(subject);

            if (index > -1) {
                selectedSubjects.splice(index, 1);
                button.classList.remove('selected');
            } else {
                selectedSubjects.push(subject);
                button.classList.add('selected');
            }

            document.getElementById("proceedBtn").style.display = selectedSubjects.length ? "inline-block" : "none";
            document.getElementById("selectedSubjects").value = selectedSubjects.join(',');
        }
    </script>
</body>
</html>
