const { GlobalKeyboardListener } = require('node-global-key-listener');

// Track mouse clicks
let mouseClickCount = 0;

// Initialize the global keyboard listener
const gkl = new GlobalKeyboardListener();

gkl.addListener((event) => {
  if (event.state === 'DOWN' && event.name === 'MouseLeft') {
    mouseClickCount++;
    console.log(`Mouse clicked ${mouseClickCount} times. Event:`, event);
  }
});

console.log('Mouse tracker started. Listening for mouse clicks...');
