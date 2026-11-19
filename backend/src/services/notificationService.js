const { Notification } = require('../models');

function createNotification(userId, message) {
  return Notification.create({ userId, message });
}

module.exports = { createNotification };
