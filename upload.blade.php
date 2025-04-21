<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Image Upload</title>
</head>
<body>
    <h1>Upload an Image</h1>
    <input type="file" id="imageInput" accept="image/*">
    <button id="uploadButton">Upload</button>
    <p id="uploadStatus" style="margin-top: 10px; font-weight: bold;"></p> <!-- Status message -->

    <script>
        document.getElementById('uploadButton').addEventListener('click', async () => {
            const imageInput = document.getElementById('imageInput');
            const uploadStatus = document.getElementById('uploadStatus');

            if (!imageInput.files.length) {
                uploadStatus.textContent = 'Please select an image to upload.';
                uploadStatus.style.color = 'red';
                return;
            }

            const formData = new FormData();
            formData.append('file', imageInput.files[0]);

            uploadStatus.textContent = 'Uploading...';
            uploadStatus.style.color = 'blue';

            try {
                const response = await fetch('/upload', {
                    method: 'POST',
                    headers: {
                        'X-CSRF-TOKEN': '{{ csrf_token() }}' // Include CSRF token for Laravel
                    },
                    body: formData
                });

                const result = await response.json();
                if (response.ok) {
                    uploadStatus.textContent = 'Image uploaded successfully: ' + result.file_path;
                    uploadStatus.style.color = 'green';
                } else {
                    uploadStatus.textContent = 'Upload failed: ' + result.message;
                    uploadStatus.style.color = 'red';
                }
            } catch (error) {
                console.error('Error uploading image:', error);
                uploadStatus.textContent = 'An error occurred while uploading the image.';
                uploadStatus.style.color = 'red';
            }
        });
    </script>
</body>
</html>
