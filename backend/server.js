require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const { start } = require('./src/app');

start().catch((error) => {
  console.error('Unable to start Snooker Booking:', error.message);
  process.exitCode = 1;
});
