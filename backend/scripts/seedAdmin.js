require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const bcrypt = require('bcryptjs');
const { User, sequelize } = require('../src/models');
const { connectDatabase } = require('../src/config/database');

async function seedAdmin() {
  const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error('Set ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD in backend/.env before seeding.');
  }
  if (ADMIN_PASSWORD.length < 12) {
    throw new Error('ADMIN_PASSWORD must be at least 12 characters.');
  }

  await connectDatabase();
  const email = ADMIN_EMAIL.trim().toLowerCase();
  const existing = await User.findOne({ where: { email } });
  if (existing) {
    if (existing.role !== 'admin') {
      existing.role = 'admin';
      await existing.save();
    }
    console.log(`Administrator role confirmed for ${email}.`);
  } else {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    await User.create({ name: ADMIN_NAME, email, passwordHash, role: 'admin' });
    console.log(`Administrator account created for ${email}.`);
  }
}

seedAdmin()
  .catch((error) => {
    console.error('Could not create the administrator:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
