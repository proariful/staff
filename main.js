const { app, BrowserWindow, ipcMain, Notification } = require('electron');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let mainWindow;
let pythonProcess;
let timerInterval = null;
let timerSeconds = 0;
let keystrokes = 0;
let mouseMovements = 0;
let mouseClicks = 0;
let lastActivityTime = Date.now(); // Track the last activity time
const INACTIVITY_LIMIT = 1 * 30 * 1000; // 10 minutes in milliseconds
let nextInsertTime = null; // Track the next system time for data insertion

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
      profile_picture TEXT
    )
  `, (err) => {
    if (err) {
      console.error('Error creating login_data table:', err.message);
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

// Function to calculate the next 1-minute interval (for local testing)
function calculateNextInsertTime() {
  const now = new Date();
  const nextTime = new Date(now);
  nextTime.setMinutes(now.getMinutes() + 1, 0, 0); // Increment minutes by 1 and reset seconds and milliseconds
  return nextTime;
}

// Function to insert data into the database and reset counters
function insertTrackingData() {
  const currentTime = new Date().toISOString();
  db.run(`
    INSERT INTO tracking (starttime, timerseconds, keystrokes, mousemovement, mouseclick)
    VALUES (?, ?, ?, ?, ?)
  `, [currentTime, timerSeconds, keystrokes, mouseMovements, mouseClicks], (err) => {
    if (err) {
      console.error('Error inserting tracking data:', err.message);
    } else {
      console.log('Tracking data saved successfully at', currentTime);
    }

    // Reset counters
    resetCounters();
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
    console.log('Inactivity detected. Stopping timer and saving data.');

    // Stop the timer and tracking
    stopTimer();
    stopPythonTracking();

    // Insert tracking data into the database
    const startTime = new Date().toISOString(); // Use current time if no start time is available
    db.run(`
      INSERT INTO tracking (starttime, timerseconds, keystrokes, mousemovement, mouseclick)
      VALUES (?, ?, ?, ?, ?)
    `, [startTime, timerSeconds, keystrokes, mouseMovements, mouseClicks], (err) => {
      if (err) {
        console.error('Error inserting tracking data on inactivity:', err.message);
      } else {
        console.log('Tracking data saved successfully on inactivity.');
      }

      // Reset counters
      resetCounters();

      // Notify the renderer process to toggle the "Stop" button
      mainWindow.webContents.send('inactivity-detected');

      // Send a notification
      new Notification({
        title: 'Inactivity Detected',
        body: 'Timer stopped due to inactivity. Data has been saved.',
      }).show();
    });
  }
}

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
    clearInterval(timerInterval);
    timerInterval = null;
    console.log('Timer stopped.');
  }
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
    INSERT OR REPLACE INTO login_data (id, user_id, username, full_name, email, points, balance, profile_picture)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?)
  `, [userData.id, userData.username, userData.full_name, userData.email, userData.points, userData.balance, userData.profile_picture], (err) => {
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
  db.all(`SELECT * FROM tracking ORDER BY id DESC`, [], (err, rows) => {
    if (err) {
      console.error('Error fetching tracking data:', err.message);
      event.reply('reports-data', []);
    } else {
      console.log('Fetched tracking data in descending order:', rows);
      event.reply('reports-data', rows);
    }
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
