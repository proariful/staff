const { app, BrowserWindow, ipcMain, Notification, shell } = require('electron'); // Import shell to open folders
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const screenshot = require('screenshot-desktop'); // Import the screenshot-desktop package
const os = require('os'); // Import the os module to determine the user's home directory
const sharp = require('sharp'); // Import the sharp library for image compression
const axios = require('axios'); // Import axios for HTTP requests

let mainWindow;
let pythonProcess;
let timerInterval = null;
let timerSeconds = 0;
let keystrokes = 0;
let mouseMovements = 0;
let mouseClicks = 0;
let lastActivityTime = Date.now(); // Track the last activity time
const INACTIVITY_LIMIT = 9 * 60 * 1000; // 1 minute in milliseconds
let nextInsertTime = null; // Track the next system time for data insertion
let inactivityNotified = false; // Flag to track if inactivity notification has been sent

// Determine the writable database path
const userDataPath = app.getPath('userData'); // Get a writable directory
const writableDbPath = path.join(userDataPath, 'user_data.db');

// Copy the database file to the writable location in production
if (app.isPackaged) {
  const packagedDbPath = path.join(process.resourcesPath, 'user_data.db');
  if (!fs.existsSync(writableDbPath)) {
    fs.copyFileSync(packagedDbPath, writableDbPath); // Copy the database file
    console.log('Database copied to writable location:', writableDbPath);
  }
} else {
  console.log('Running in development mode. Using local database file.');
}

// Use the writable database path
const db = new sqlite3.Database(writableDbPath, (err) => {
  if (err) {
    console.error('Failed to connect to the database:', err.message);
  } else {
    console.log('Connected to the database at', writableDbPath);
  }
});

// Create the `users` table if it doesn't exist
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      firstName TEXT NOT NULL,
      lastName TEXT NOT NULL
    )
  `, (err) => {
    if (err) {
      console.error('Error creating users table:', err.message);
    }
  });
});

// Add a column for selected_project_id if it doesn't exist
db.run(`
  ALTER TABLE users ADD COLUMN selected_project_id INTEGER
`, (err) => {
  if (err && !err.message.includes('duplicate column')) {
    console.error('Error adding selected_project_id column:', err.message);
  }
});

// Create the `login_data` table if it doesn't exist
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS login_data (
      id INTEGER PRIMARY KEY,
      user_id INTEGER,
      username TEXT,
      full_name TEXT,
      email TEXT,
      points INTEGER,
      balance INTEGER,
      profile_picture TEXT,
      token TEXT
    )
  `, (err) => {
    if (err) {
      console.error('Error creating login_data table:', err.message);
    }
  });
});

// Update the `login_data` table to include a `token` column
db.serialize(() => {
  db.run(`
    ALTER TABLE login_data ADD COLUMN token TEXT
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding token column to login_data table:', err.message);
    } else {
      console.log('Token column added to login_data table or already exists.');
    }
  });
});

// Create the `tracking` table if it doesn't exist
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS tracking (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      starttime TEXT NOT NULL,
      timerseconds INTEGER NOT NULL,
      keystrokes INTEGER NOT NULL,
      mousemovement INTEGER NOT NULL,
      mouseclick INTEGER NOT NULL
    )
  `, (err) => {
    if (err) {
      console.error('Error creating tracking table:', err.message);
    }
  });
});

// Update the `tracking` table to include a `screenshots` column
db.serialize(() => {
  db.run(`
    ALTER TABLE tracking ADD COLUMN screenshots TEXT
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding screenshots column to tracking table:', err.message);
    } else {
      console.log('Screenshots column added to tracking table or already exists.');
    }
  });
});

// Update the `tracking` table to include `project_id` and `name` columns
db.serialize(() => {
  db.run(`
    ALTER TABLE tracking ADD COLUMN project_id INTEGER
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding project_id column to tracking table:', err.message);
    } else {
      console.log('project_id column added to tracking table or already exists.');
    }
  });

  db.run(`
    ALTER TABLE tracking ADD COLUMN project_name TEXT
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding project_name column to tracking table:', err.message);
    } else {
      console.log('project_name column added to tracking table or already exists.');
    }
  });
});

// Update the `tracking` table to include `user_id` column
db.serialize(() => {
  db.run(`
    ALTER TABLE tracking ADD COLUMN user_id INTEGER
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding user_id column to tracking table:', err.message);
    } else {
      console.log('user_id column added to tracking table or already exists.');
    }
  });
});

// Update the `tracking` table to include a `status` column
db.serialize(() => {
  db.run(`
    ALTER TABLE tracking ADD COLUMN status INTEGER DEFAULT 0
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding status column to tracking table:', err.message);
    } else {
      console.log('Status column added to tracking table or already exists.');
    }
  });
});

// Create the `projects` table if it doesn't exist
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      employee_id INTEGER NOT NULL,
      assigned_at TEXT NOT NULL,
      selected_project_id INTEGER DEFAULT NULL
    )
  `, (err) => {
    if (err) {
      console.error('Error creating projects table:', err.message);
    } else {
      console.log('Projects table created or already exists.');
    }
  });
});

// Ensure the `selected_project_id` column exists in the `projects` table
db.serialize(() => {
  db.run(`
    ALTER TABLE projects ADD COLUMN selected_project_id INTEGER DEFAULT NULL
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding selected_project_id column to projects table:', err.message);
    } else {
      console.log('selected_project_id column added to projects table or already exists.');
    }
  });
});

// Ensure the `project_id` column is unique in the `projects` table
db.serialize(() => {
  db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_project_id ON projects (project_id)
  `, (err) => {
    if (err) {
      console.error('Error creating unique index on project_id:', err.message);
    } else {
      console.log('Unique index on project_id created or already exists.');
    }
  });
});

// Remove the unique constraint on the `id` column (if previously added)
db.serialize(() => {
  db.run(`
    DROP INDEX IF EXISTS idx_projects_id
  `, (err) => {
    if (err) {
      console.error('Error dropping unique index on id in projects table:', err.message);
    } else {
      console.log('Unique index on id in projects table removed (if it existed).');
    }
  });
});

app.on('ready', () => {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile('index.html');
});

// Directory to save screenshots
const screenshotsDir = path.join(__dirname, 'screenshots'); // Use the current directory for screenshots
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir); // Create the screenshots directory if it doesn't exist
}

// Function to take a screenshot
let screenshotNames = []; // Array to store screenshot names for the current interval

function takeScreenshot() {
  if (!timerInterval) {
    console.log('Timer is not running. Skipping screenshot.');
    return; // Do not take a screenshot if the timer is not running
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-'); // Format timestamp for filename
  const compressedPath = path.join(screenshotsDir, `screenshot-${timestamp}-compressed.jpg`);

  screenshot()
    .then((imgBuffer) => {
      // Compress the screenshot directly from the buffer
      sharp(imgBuffer)
        .resize(1280, 720) // Resize to 1280x720 (optional, adjust as needed)
        .jpeg({ quality: 40 }) // Convert to JPEG with 40% quality
        .toFile(compressedPath)
        .then(() => {
          console.log(`Compressed screenshot saved: ${compressedPath}`);
          screenshotNames.push(path.basename(compressedPath)); // Add the compressed screenshot name to the array

          // Show a notification after the screenshot is taken
          new Notification({
            title: 'Screenshot Taken',
            body: `Screenshot saved as: ${path.basename(compressedPath)}`,
          }).show();
        })
        .catch((err) => {
          console.error('Error compressing screenshot:', err.message);
        });
    })
    .catch((err) => {
      console.error('Error taking screenshot:', err.message);
    });
}

// Start taking screenshots every minute
setInterval(takeScreenshot, 3 * 60 * 1000); // Take a screenshot every 3 minutes

// Function to calculate the next 1-minute interval (for local testing)
function calculateNextInsertTime() {
  const now = new Date();
  const nextTime = new Date(now);
  nextTime.setMinutes(now.getMinutes() + 10, 0, 0); // Increment minutes by 1 and reset seconds and milliseconds
  return nextTime;
}

// Function to insert data into the database and reset counters
function insertTrackingData() {
  const currentTime = new Date().toISOString();
  const screenshotsString = screenshotNames.join(','); // Convert screenshot names to a comma-separated string

  // Fetch the currently logged-in user and selected project
  db.get(`SELECT user_id FROM login_data WHERE id = 1`, [], (err, userRow) => {
    if (err || !userRow) {
      console.error('Error retrieving user_id:', err ? err.message : 'No user logged in.');
      return; // Exit if no user is logged in
    }

    const loggedInUserId = userRow.user_id;

    db.get(`SELECT project_id, name FROM projects WHERE selected_project_id = 1`, [], (err, projectRow) => {
      const selectedProjectId = projectRow ? projectRow.project_id : null;
      const selectedProjectName = projectRow ? projectRow.name : null;

      db.run(`
        INSERT INTO tracking (starttime, timerseconds, keystrokes, mousemovement, mouseclick, screenshots, project_id, project_name, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [currentTime, timerSeconds, keystrokes, mouseMovements, mouseClicks, screenshotsString, selectedProjectId, selectedProjectName, loggedInUserId], (err) => {
        if (err) {
          console.error('Error inserting tracking data:', err.message);
        } else {
          console.log('Tracking data saved successfully at', currentTime);
        }

        // Reset counters and screenshot names
        resetCounters();
        screenshotNames = [];
      });
    });
  });
}

// Function to reset counters
function resetCounters() {
  timerSeconds = 0;
  keystrokes = 0;
  mouseMovements = 0;
  mouseClicks = 0;

  // Notify the Python process about the reset
  if (pythonProcess && pythonProcess.stdin.writable) {
    pythonProcess.stdin.write(JSON.stringify({ type: 'reset' }) + '\n');
  }

  // Log the reset values to confirm
  console.log('Counters reset:', { timerSeconds, keystrokes, mouseMovements, mouseClicks });
}

// Function to check if it's time to insert data
function checkInsertTime() {
  const now = new Date();
  if (nextInsertTime && now >= nextInsertTime) {
    insertTrackingData();
    nextInsertTime = calculateNextInsertTime(); // Update the next insert time
  }
}

// Function to check for inactivity
function checkInactivity() {
  const currentTime = Date.now();
  if (currentTime - lastActivityTime >= INACTIVITY_LIMIT) {
    if (!inactivityNotified) {
      console.log('Inactivity detected. Stopping timer and saving data.');

      // Stop the timer and tracking
      stopTimer();
      stopPythonTracking();

      // Insert tracking data into the database
      const startTime = new Date().toISOString(); // Use current time if no start time is available
      db.run(`
        INSERT INTO tracking (starttime, timerseconds, keystrokes, mousemovement, mouseclick, screenshots)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [startTime, timerSeconds, keystrokes, mouseMovements, mouseClicks, screenshotNames.join(',')], (err) => {
        if (err) {
          console.error('Error inserting tracking data on inactivity:', err.message);
        } else {
          console.log('Tracking data saved successfully on inactivity.');
        }

        // Reset counters and screenshot names
        resetCounters();
        screenshotNames = [];

        // Notify the renderer process to toggle the "Stop" button
        mainWindow.webContents.send('inactivity-detected');

        // Send a notification
        new Notification({
          title: 'Inactivity Detected',
          body: 'Timer stopped due to inactivity. Data has been saved.',
        }).show();

        // Set the flag to prevent duplicate notifications
        inactivityNotified = true;
      });
    }
  } else {
    // Reset the flag if activity is detected
    inactivityNotified = false;
  }
}

// Ensure `checkInactivity` is called regularly
setInterval(checkInactivity, 1000); // Check for inactivity every second

// Function to start the Python process
function startPythonTracking() {
  const pythonScriptPath = path.join(__dirname, 'input_tracker.py');
  pythonProcess = spawn('python', [pythonScriptPath]);

  pythonProcess.stdout.on('data', (data) => {
    const message = data.toString().trim();
    try {
      const event = JSON.parse(message);
      lastActivityTime = Date.now(); // Update the last activity time on any event
      if (event.type === 'keystroke') {
        keystrokes = event.count;
        mainWindow.webContents.send('keystroke-update', keystrokes);
      } else if (event.type === 'mouseclick') {
        mouseClicks = event.count;
        mainWindow.webContents.send('mouseclick-update', mouseClicks);
      } else if (event.type === 'mousemove') {
        mouseMovements = event.count;
        mainWindow.webContents.send('mousemove-update', mouseMovements);
      }
    } catch (err) {
      console.error('Failed to parse Python output:', message);
    }
  });

  pythonProcess.stderr.on('data', (data) => {
    console.error(`Python error: ${data}`);
  });

  pythonProcess.on('close', (code) => {
    console.log(`Python script exited with code ${code}`);
  });

  console.log('Python tracking started.');
}

// Function to stop the Python process
function stopPythonTracking() {
  if (pythonProcess) {
    pythonProcess.kill();
    pythonProcess = null;
    console.log('Python tracking stopped.');
  }
}

// Function to start the timer
function startTimer() {
  resetCounters();
  nextInsertTime = calculateNextInsertTime(); // Calculate the first insert time
  mainWindow.webContents.send('timer-update', '00:00'); // Send initial timer value to the renderer

  timerInterval = setInterval(() => {
    timerSeconds++;
    const minutes = String(Math.floor(timerSeconds / 60)).padStart(2, '0');
    const seconds = String(timerSeconds % 60).padStart(2, '0');
    const formattedTime = `${minutes}:${seconds}`;

    mainWindow.webContents.send('timer-update', formattedTime); // Send updated timer value

    if (nextInsertTime && new Date() >= nextInsertTime) {
      insertTrackingData();
      nextInsertTime = calculateNextInsertTime(); // Update the next insert time
    }
  }, 1000);

  console.log('Timer started.');
}

// Function to stop the timer
function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval); // Clear the interval
    timerInterval = null; // Reset the interval variable
    console.log('Timer stopped.');
  }

  // Reset the next insert time to prevent further data insertion
  nextInsertTime = null;

  // Notify the renderer process to update the UI
  mainWindow.webContents.send('tracking-stopped');
}

// Handle save-user event
ipcMain.on('save-user', (event, { firstName, lastName }) => {
  db.run(
    `INSERT INTO users (firstName, lastName) VALUES (?, ?)`,
    [firstName, lastName],
    (err) => {
      if (err) {
        console.error('Error inserting user:', err.message); // Log the error
        event.reply('save-user-response', { success: false, message: 'Database error: ' + err.message });
      } else {
        const response = { success: true, message: 'User saved successfully', data: { firstName, lastName } };
        console.log('API Response:', response); // Log the API response
        event.reply('save-user-response', response);
      }
    }
  );
});

// Handle get-users event
ipcMain.on('get-users', (event) => {
  db.all(`SELECT firstName, lastName FROM users`, [], (err, rows) => {
    if (err) {
      console.error('Error fetching users:', err.message); // Log the error
      event.reply('get-users-response', []);
    } else {
      const response = { success: true, data: rows };
      console.log('API Response:', response); // Log the API response
      event.reply('get-users-response', rows);
    }
  });
});

// Save login data
ipcMain.on('save-login-data', (event, userData) => {
  db.run(`
    INSERT OR REPLACE INTO login_data (id, user_id, username, full_name, email, points, balance, profile_picture, token)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [userData.id, userData.username, userData.full_name, userData.email, userData.points, userData.balance, userData.profile_picture, userData.token], (err) => {
    if (err) {
      console.error('Error saving login data:', err.message);
    } else {
      console.log('Login data saved successfully:', userData);
    }
  });
});

// Retrieve login data
ipcMain.on('get-login-data', (event) => {
  db.get(`SELECT * FROM login_data WHERE id = 1`, [], (err, row) => {
    if (err) {
      console.error('Error retrieving login data:', err.message);
      event.reply('login-data-response', null);
    } else {
      console.log('Retrieved login data:', row);
      event.reply('login-data-response', row);
    }
  });
});

// Clear login data on logout
ipcMain.on('logout-user', () => {
  db.run(`DELETE FROM login_data WHERE id = 1`, (err) => {
    if (err) {
      console.error('Error clearing login data:', err.message);
    } else {
      console.log('Login data cleared successfully');
    }
  });
});

// Handle storing projects fetched from the API
ipcMain.on('store-projects', (event, projects) => {
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO projects (project_id, name, employee_id, assigned_at)
    VALUES (?, ?, ?, ?)
  `);

  projects.forEach((project) => {
    insertStmt.run(
      project.project_id,
      project.name,
      project.employee_id,
      project.assigned_at,
      (err) => {
        if (err) {
          console.error('Error inserting project:', err.message);
        }
      }
    );
  });

  insertStmt.finalize(() => {
    console.log('Projects saved successfully.');
  });
});

// Handle fetching projects (online or offline)
ipcMain.on('fetch-projects', (event) => {
  db.all(`SELECT project_id, name FROM projects`, [], (err, rows) => {
    if (err) {
      console.error('Error fetching projects from database:', err.message);
      event.reply('projects-data', []);
    } else {
      console.log('Fetched projects from database:', rows);
      event.reply('projects-data', rows);
    }
  });
});

// Handle saving the selected project
ipcMain.on('save-selected-project', (event, { projectId }) => {
  // Clear the previous selection
  db.run(
    `UPDATE projects SET selected_project_id = NULL WHERE selected_project_id = 1`,
    (err) => {
      if (err) {
        console.error('Error clearing previous selected project:', err.message);
      } else {
        // Mark the new project as selected
        db.run(
          `UPDATE projects SET selected_project_id = 1 WHERE project_id = ?`,
          [projectId],
          (err) => {
            if (err) {
              console.error('Error saving selected project:', err.message);
            } else {
              console.log('Selected project updated successfully.');
            }
          }
        );
      }
    }
  );
});

// Handle retrieving the selected project
ipcMain.on('get-selected-project', (event) => {
  db.get(
    `SELECT project_id, name FROM projects WHERE selected_project_id = 1`,
    [],
    (err, row) => {
      if (err) {
        console.error('Error retrieving selected project:', err.message);
        event.reply('selected-project-response', null);
      } else {
        event.reply('selected-project-response', row ? { projectId: row.project_id, projectName: row.name } : null);
      }
    }
  );
});

// Handle start and stop tracking events from the renderer process
ipcMain.on('start-tracking', () => {
  startTimer();
  startPythonTracking();
  console.log('Tracking and timer started.');
});

ipcMain.on('stop-tracking', () => {
  stopTimer();
  stopPythonTracking();
  insertTrackingData(); // Insert final data before stopping
  console.log('Tracking and timer stopped.');
});

// Handle fetch-reports event
ipcMain.on('fetch-reports', (event) => {
  db.all(`
    SELECT id, starttime, timerseconds, keystrokes, mousemovement, mouseclick, screenshots, project_id, project_name, user_id
    FROM tracking
    ORDER BY id DESC
  `, [], (err, rows) => {
    if (err) {
      console.error('Error fetching tracking data:', err.message);
      event.reply('reports-data', []);
    } else {
      console.log('Fetched tracking data with user IDs:', rows);
      event.reply('reports-data', rows);
    }
  });
});

// Function to calculate total active times
function getActiveTimes(callback) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString();
  const last7DaysStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6).toISOString();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString();

  const queries = {
    today: `SELECT SUM(timerseconds) AS total FROM tracking WHERE starttime >= ?`,
    yesterday: `SELECT SUM(timerseconds) AS total FROM tracking WHERE starttime >= ? AND starttime < ?`,
    last7Days: `SELECT SUM(timerseconds) AS total FROM tracking WHERE starttime >= ?`,
    thisMonth: `SELECT SUM(timerseconds) AS total FROM tracking WHERE starttime >= ?`,
    lastMonth: `SELECT SUM(timerseconds) AS total FROM tracking WHERE starttime >= ? AND starttime < ?`,
  };

  const results = {};

  db.serialize(() => {
    db.get(queries.today, [todayStart], (err, row) => {
      results.today = row?.total || 0;
    });

    db.get(queries.yesterday, [yesterdayStart, todayStart], (err, row) => {
      results.yesterday = row?.total || 0;
    });

    db.get(queries.last7Days, [last7DaysStart], (err, row) => {
      results.last7Days = row?.total || 0;
    });

    db.get(queries.thisMonth, [thisMonthStart], (err, row) => {
      results.thisMonth = row?.total || 0;
    });

    db.get(queries.lastMonth, [lastMonthStart, lastMonthEnd], (err, row) => {
      results.lastMonth = row?.total || 0;

      // Convert seconds to hours and minutes
      for (const key in results) {
        const totalSeconds = results[key];
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        results[key] = `${hours}h ${minutes}m`;
      }

      callback(results);
    });
  });
}

// Handle fetch-active-times event
ipcMain.on('fetch-active-times', (event) => {
  getActiveTimes((results) => {
    event.reply('active-times-response', results);
  });
});

// Function to format ISO date to MySQL DATETIME format
function formatToMySQLDateTime(isoDate) {
  const date = new Date(isoDate);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// Handle sending tracking data to the server
ipcMain.on('send-tracking-data', (event) => {
  // Retrieve the token from the login_data table
  db.get(`SELECT token FROM login_data WHERE id = 1`, [], async (err, row) => {
    if (err || !row) {
      console.error('Error retrieving token:', err ? err.message : 'No token found.');
      event.reply('send-tracking-data-response', { success: false, message: 'User is not logged in.' });
      return;
    }

    const userToken = row.token;

    // Fetch only records with status 0 (not uploaded)
    db.all(`SELECT * FROM tracking WHERE status = 0`, [], async (err, rows) => {
      if (err) {
        console.error('Error fetching tracking data:', err.message);
        event.reply('send-tracking-data-response', { success: false, message: 'Failed to fetch tracking data.' });
        return;
      }

      if (rows.length === 0) {
        console.log('No unuploaded tracking data to upload.');
        event.reply('send-tracking-data-response', { success: true, message: 'No unuploaded data to upload.' });
        return;
      }

      // Format the starttime values to MySQL DATETIME format
      const formattedRows = rows.map((row) => ({
        ...row,
        starttime: formatToMySQLDateTime(row.starttime),
      }));

      try {
        const response = await axios.post('https://www.bissoy.com/api/tracking', { data: formattedRows }, {
          headers: { Authorization: `Bearer ${userToken}` },
        });

        if (response.status === 200 && response.data.status === 'success') {
          console.log('Tracking data sent successfully:', response.data);

          // Update the status to 1 for successfully sent records
          const ids = rows.map((row) => row.id).join(',');
          db.run(`UPDATE tracking SET status = 1 WHERE id IN (${ids})`, (err) => {
            if (err) {
              console.error('Error updating tracking status to uploaded:', err.message);
            } else {
              console.log('Tracking status updated to uploaded for records:', ids);
            }
          });

          event.reply('send-tracking-data-response', { success: true, message: 'Tracking data sent successfully.' });
        } else {
          console.error('Failed to send tracking data:', response.data);
          event.reply('send-tracking-data-response', { success: false, message: 'Failed to send tracking data.' });
        }
      } catch (error) {
        console.error('Error sending tracking data:', error.response?.data || error.message);
        event.reply('send-tracking-data-response', { success: false, message: 'Error sending tracking data.' });
      }
    });
  });
});

app.on('window-all-closed', () => {
  if (timerInterval || pythonProcess) {
    console.log('App is closing. Stopping timer and saving tracking data.');

    // Stop the timer
    stopTimer();

    // Stop the Python tracking process
    stopPythonTracking();

    // Insert tracking data into the database
    const startTime = new Date().toISOString(); // Use current time if no start time is available
    db.run(`
      INSERT INTO tracking (starttime, timerseconds, keystrokes, mousemovement, mouseclick)
      VALUES (?, ?, ?, ?, ?)
    `, [startTime, timerSeconds, keystrokes, mouseMovements, mouseClicks], (err) => {
      if (err) {
        console.error('Error inserting tracking data on app close:', err.message);
      } else {
        console.log('Tracking data saved successfully on app close.');
      }

      // Reset counters

      resetCounters();

      // Quit the app
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });
  } else {
    // Quit the app directly if no timer or tracking is active
    if (process.platform !== 'darwin') {
      app.quit();
    }
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = new BrowserWindow({
      width: 800,
      height: 600,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    mainWindow.loadFile('index.html');
  }
});
