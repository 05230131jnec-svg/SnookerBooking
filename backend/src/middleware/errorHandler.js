const { isDuplicateKeyError } = require('../utils/bookingUtils');

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (isDuplicateKeyError(error)) return res.status(409).json({ error: 'That record already exists.' });
  if (error.name === 'SequelizeValidationError') {
    const message = error.errors.map((item) => item.message).join(' ');
    return res.status(400).json({ error: message });
  }
  if (error.name === 'SequelizeDatabaseError') {
    return res.status(400).json({ error: 'Invalid identifier or value.' });
  }
  if (error.status && error.status < 500) return res.status(error.status).json({ error: error.message });
  console.error(error);
  return res.status(500).json({ error: 'The request could not be completed. Check the server logs.' });
}

module.exports = errorHandler;
