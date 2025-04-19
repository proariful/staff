const { app, BrowserWindow, ipcMain } = require('electron');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let mainWindow;
let pythonProcess;

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

  // Start the Python script
  const pythonScriptPath = path.join(__dirname, 'input_tracker.py');
  pythonProcess = spawn('python', [pythonScriptPath]);

  pythonProcess.stdout.on('data', (data) => {
    const message = data.toString().trim();
    try {
      const event = JSON.parse(message);
      if (event.type === 'keystroke') {
        mainWindow.webContents.send('keystroke-update', event.count);
      } else if (event.type === 'mouseclick') {
        mainWindow.webContents.send('mouseclick-update', event.count);
      } else if (event.type === 'mousemove') {
        mainWindow.webContents.send('mousemove-update', event.count);
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
});

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
  console.log('Tracking started (no functionality implemented)');
});

ipcMain.on('stop-tracking', () => {
  console.log('Tracking stopped (no functionality implemented)');
});

app.on('window-all-closed', () => {
  if (pythonProcess) {
    pythonProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
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
