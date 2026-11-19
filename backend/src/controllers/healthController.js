const { sequelize } = require('../config/database');

async function healthController(req, res) {
  try {
    await sequelize.authenticate();
    return res.status(200).json({ status: 'ok', database: 'connected' });
  } catch {
    return res.status(503).json({ status: 'unavailable', database: 'disconnected' });
  }
}

module.exports = healthController;
