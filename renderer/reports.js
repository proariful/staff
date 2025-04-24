const { ipcRenderer } = require('electron');
const path = require('path');

// Fetch the writable directory path from the main process
let writableDir;
ipcRenderer.invoke('get-writable-dir').then((dir) => {
  writableDir = dir;
});

// Request reports data when the "Reports" button is clicked
document.getElementById('reports-button').addEventListener('click', () => {
  ipcRenderer.send('fetch-reports');
});

// Listen for the response and update the UI
ipcRenderer.on('reports-data', (event, data) => {
  console.log('Reports data received:', data);
  const reportsContainer = document.getElementById('reports-container');
  reportsContainer.innerHTML = ''; // Clear existing content

  if (data && Array.isArray(data) && data.length > 0) {
    data.forEach((report) => {
      // Ensure writableDir is available before processing screenshots
      if (!writableDir) {
        console.error('Writable directory is not available.');
        reportsContainer.innerHTML = '<p>Error: Unable to resolve screenshot paths.</p>';
        return;
      }

      // Filter out empty strings from screenshots and resolve full paths
      const processedScreenshots = report.screenshots
        .filter(screenshot => screenshot.trim() !== '')
        .map(screenshot => path.join('file://', writableDir, 'screenshots', screenshot)); // Use the correct writable directory

      console.log('Processed screenshots:', processedScreenshots);

      const reportElement = document.createElement('div');
      reportElement.classList.add('report-item');
      reportElement.innerHTML = `
        <p><strong>Start Time:</strong> ${new Date(report.starttime).toLocaleString()}</p>
        <p><strong>Timer Seconds:</strong> ${report.timerseconds}</p>
        <p><strong>Keystrokes:</strong> ${report.keystrokes}</p>
        <p><strong>Mouse Movement:</strong> ${report.mousemovement}</p>
        <p><strong>Mouse Clicks:</strong> ${report.mouseclick}</p>
        <p><strong>Project Name:</strong> ${report.project_name || 'N/A'}</p>
        <p><strong>User ID:</strong> ${report.user_id || 'N/A'}</p>
        <p><strong>Screenshots:</strong></p>
        <ul>
          ${processedScreenshots.map(screenshot => `<li><a href="${screenshot}" target="_blank">${screenshot}</a></li>`).join('')}
        </ul>
      `;
      reportsContainer.appendChild(reportElement);
    });
  } else {
    reportsContainer.innerHTML = '<p>No reports available.</p>';
  }
});

// Listen for keystroke updates
ipcRenderer.on('keystroke-update', (event, keystrokeCount) => {
  console.log(`Keystroke count updated: ${keystrokeCount}`);
  const keystrokeElement = document.getElementById('keystroke-count');
  if (keystrokeElement) {
    keystrokeElement.textContent = `Keystrokes: ${keystrokeCount}`;
  }
});

// Listen for mouse click updates
ipcRenderer.on('mouse-click-update', (event, mouseClickCount) => {
  console.log(`Mouse click count updated: ${mouseClickCount}`);
  const mouseClickElement = document.getElementById('mouse-click-count');
  if (mouseClickElement) {
    mouseClickElement.textContent = `Mouse Clicks: ${mouseClickCount}`;
  }
});

// Listen for mouse move updates
ipcRenderer.on('mouse-move-update', (event, mouseMoveCount) => {
  console.log(`Mouse move count updated: ${mouseMoveCount}`);
  const mouseMoveElement = document.getElementById('mouse-move-count');
  if (mouseMoveElement) {
    mouseMoveElement.textContent = `Mouse Moves: ${mouseMoveCount}`;
  }
});