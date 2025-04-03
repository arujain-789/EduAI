 const SERVER_URL = "https://eduai2025.app";
        
        // DOM Elements
        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('fileInput');
        const browseBtn = document.getElementById('browseBtn');
        const progressContainer = document.getElementById('progressContainer');
        const progressBar = document.getElementById('progressBar');
        const progressPercent = document.getElementById('progressPercent');
        const resultsDiv = document.getElementById('results');
        const fileList = document.getElementById('fileList');
        const emptyState = document.getElementById('emptyState');
        const statusBadge = document.getElementById('statusBadge');

        // Drag and Drop Handling
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, preventDefaults, false);
        });

        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, highlight, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, unhighlight, false);
        });

        function highlight() {
            dropZone.classList.add('dragover');
            statusBadge.textContent = "Drop PDF";
            statusBadge.className = "badge bg-warning text-dark";
        }

        function unhighlight() {
            dropZone.classList.remove('dragover');
            statusBadge.textContent = "Ready";
            statusBadge.className = "badge bg-light text-primary";
        }

        dropZone.addEventListener('drop', handleDrop, false);

        function handleDrop(e) {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files.length && files[0].type === 'application/pdf') {
                fileInput.files = files;
                handleFiles(files);
            }
        }

     browseBtn.addEventListener('click', (e) => {
    e.preventDefault();
    fileInput.click();
});

        fileInput.addEventListener('change', (e) => {
    if (fileInput.files && fileInput.files.length > 0) {
        handleFiles(fileInput.files);
    }
});

        // File Handling
        async function handleFiles(files) {
            
            const file = files[0];
            if (file.type !== 'application/pdf') {
                updateStatus("Only PDF files allowed", "danger");
                return;
            }

            updateStatus("Uploading...", "info");
            showProgress();

            const formData = new FormData();
            formData.append('pdf', file);

            try {
                const xhr = new XMLHttpRequest();
                
                xhr.upload.addEventListener('progress', (e) => {
                    if (e.lengthComputable) {
                        const percent = Math.round((e.loaded / e.total) * 100);
                        updateProgress(percent);
                    }
                });

                xhr.open('POST', `${SERVER_URL}/upload`, true);
                
                xhr.onload = function() {
                    if (xhr.status === 200) {
                        const response = JSON.parse(xhr.response);
                        processSuccess(response);
                    } else {
                        throw new Error(xhr.statusText);
                    }
                };
                
                xhr.send(formData);

            } catch (error) {
                console.error('Error:', error);
                updateStatus("Upload failed", "danger");
                hideProgress();
            }
        }

        function updateProgress(percent) {
            progressBar.style.width = `${percent}%`;
            progressPercent.textContent = percent;
            
            if (percent === 100) {
                progressBar.classList.remove('progress-bar-animated');
                updateStatus("Processing with AI...", "info");
            }
        }

        function showProgress() {
            progressContainer.classList.remove('d-none');
            resultsDiv.classList.add('d-none');
        }

        function hideProgress() {
            progressContainer.classList.add('d-none');
        }

        function updateStatus(text, type) {
            statusBadge.textContent = text;
            statusBadge.className = `badge bg-${type} text-white`;
        }

        function processSuccess(response) {
            updateStatus("Grading complete", "success");
            hideProgress();
            
            // Display results
            document.getElementById('marks').textContent = response.marks;
            document.getElementById('feedback').textContent = response.feedback;
            document.getElementById('pdfLink').href = response.pdfUrl;
            resultsDiv.classList.remove('d-none');
            
            // Add to file list
            addFileToList(response.filename, response.pdfUrl);
            loadFileList();
        }

        function addFileToList(filename, url) {
            // Store in localStorage
            const files = JSON.parse(localStorage.getItem('gradedFiles') || [];
            if (!files.some(file => file.name === filename)) {
                files.push({
                    name: filename,
                    url: url,
                    date: new Date().toISOString()
                });
                localStorage.setItem('gradedFiles', JSON.stringify(files));
            }
        }

        function loadFileList() {
            const files = JSON.parse(localStorage.getItem('gradedFiles')) || [];
            
            if (files.length) {
                emptyState.classList.add('d-none');
                fileList.innerHTML = '';
                
                files.forEach(file => {
                    const fileDate = new Date(file.date).toLocaleString();
                    const listItem = document.createElement('a');
                    listItem.href = file.url;
                    listItem.target = '_blank';
                    listItem.className = 'list-group-item list-group-item-action file-list-item d-flex justify-content-between align-items-center';
                    listItem.innerHTML = `
                        <div>
                            <i class="bi bi-file-earmark-pdf text-danger me-2"></i>
                            ${file.name}
                            <div class="text-muted small">${fileDate}</div>
                        </div>
                        <i class="bi bi-box-arrow-up-right text-muted"></i>
                    `;
                    fileList.appendChild(listItem);
                });
            } else {
                emptyState.classList.remove('d-none');
            }
        }

        // Initialize
        loadFileList();
