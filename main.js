const { app, BrowserWindow, ipcMain } = require('electron');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

let mainWindow;

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
        console.log('User saved successfully:', { firstName, lastName });
        event.reply('save-user-response', { success: true, message: 'User saved successfully' });
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
      console.log('Fetched users:', rows);
      event.reply('get-users-response', rows);
    }
  });
});

app.on('window-all-closed', () => {
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
