const path = require('path');
const fs = require('fs');
const { Sequelize } = require('sequelize');

const dialect = process.env.DB_DIALECT || 'sqlite';
let sequelize;

if (process.env.DATABASE_URL) {
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect,
    logging: false,
    define: { underscored: true }
  });
} else {
  const storagePath = path.resolve(__dirname, '../../', process.env.DB_STORAGE || 'data/snooker_booking.sqlite');
  fs.mkdirSync(path.dirname(storagePath), { recursive: true });
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: storagePath,
    logging: false,
    define: { underscored: true }
  });
}

async function connectDatabase() {
  await sequelize.authenticate();
  if (sequelize.getDialect() === 'sqlite') {
    await sequelize.query('PRAGMA foreign_keys = ON;');
  }
  require('../models');
  await sequelize.sync();
}

module.exports = { sequelize, connectDatabase };
