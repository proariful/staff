# Bissoy Diagnostic Center

## Description
Bissoy Diagnostic Manager is an all-in-one desktop solution that simplifies billing, tracks earnings, and reveals deep insights to help diagnostic centers grow smarter and faster.

## Project Structure
```
diagnostic-center-billing-app
├── src
│   ├── electron.js
│   ├── main.ts
│   ├── renderer
│   │   ├── login.html
│   │   ├── login.ts
│   │   └── styles
│       └── login.css
├── package.json
├── tsconfig.json
└── README.md
```

## Setup Instructions

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd diagnostic-center-billing-app
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the project**
   ```bash
   npm run build
   ```

4. **Run the application**
   ```bash
   npm start
   ```

## Usage
Upon starting the application, the login page will be displayed. Users can enter their username and password to access the billing features.

## Database
This application uses SQLite to store user data. The database file (`user_data.db`) is created automatically in the project directory. The `users` table is used to store email and password information.

## License
This project is licensed under the MIT License.# diagnostic
