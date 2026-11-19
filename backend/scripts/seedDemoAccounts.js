require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { User, sequelize } = require('../src/models');
const { connectDatabase } = require('../src/config/database');

async function seedDemoAccounts() {
  const playerEmail = (process.env.DEMO_PLAYER_EMAIL || 'demo-player@snookerbooking.test').trim().toLowerCase();
  const adminEmail = (process.env.DEMO_ADMIN_EMAIL || 'demo-admin@snookerbooking.test').trim().toLowerCase();
  if (playerEmail === adminEmail) throw new Error('Demo player and administrator emails must be different.');

  await connectDatabase();
  const existing = await User.findAll({
    where: { email: { [Op.in]: [playerEmail, adminEmail] } },
    attributes: ['email']
  });
  if (existing.length) {
    throw new Error(`Demo account already exists for ${existing.map((user) => user.email).join(', ')}. Remove or change the configured demo email before seeding again.`);
  }

  const playerPassword = crypto.randomBytes(18).toString('base64url');
  const adminPassword = crypto.randomBytes(18).toString('base64url');
  const [playerHash, adminHash] = await Promise.all([
    bcrypt.hash(playerPassword, 12),
    bcrypt.hash(adminPassword, 12)
  ]);
  await User.bulkCreate([
    {
      name: process.env.DEMO_PLAYER_NAME || 'Demo Player',
      email: playerEmail,
      passwordHash: playerHash,
      role: 'user'
    },
    {
      name: process.env.DEMO_ADMIN_NAME || 'Demo Administrator',
      email: adminEmail,
      passwordHash: adminHash,
      role: 'admin'
    }
  ]);

  console.log('Demo accounts created. Save these generated passwords; they are not stored or shown again.');
  console.log(`Player: ${playerEmail} / ${playerPassword}`);
  console.log(`Admin:  ${adminEmail} / ${adminPassword}`);
}

seedDemoAccounts()
  .catch((error) => {
    console.error('Could not create demo accounts:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
