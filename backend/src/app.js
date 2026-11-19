const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
const { Op, fn, col } = require('sequelize');
const {
  sequelize, User, SnookerTable, Booking, BookingEquipment, BookingSlot,
  Equipment, Tournament, TournamentParticipant, Match, Feedback, Notification
} = require('./models');
const { buildSlotKeys, parseLocalStart, isDuplicateKeyError } = require('./utils/bookingUtils');
const { connectDatabase } = require('./config/database');
const asyncRoute = require('./middleware/asyncRoute');
const createAuthMiddleware = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');
const { createNotification } = require('./services/notificationService');
const healthRoutes = require('./routes/healthRoutes');

const app = express();
const port = Number(process.env.PORT) || 3000;
const sessionCookie = 'snooker_session';
const sessionDurationMs = 7 * 24 * 60 * 60 * 1000;
const clubUtcOffsetMinutes = -360;

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set to a random secret of at least 32 characters.');
}

app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(express.static(path.resolve(__dirname, '../../frontend')));
app.use('/api', healthRoutes);

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function publicUser(user) {
  return {
    id: String(user.id),
    name: user.name,
    email: user.email,
    phone: user.phone,
    studentId: user.studentId,
    role: user.role
  };
}

function validId(id) {
  const num = Number(id);
  return Number.isInteger(num) && num > 0 && String(num) === String(id).trim();
}

function requireId(id, label) {
  if (!validId(id)) throw httpError(400, `Invalid ${label}.`);
  return Number(id);
}

function serializeBooking(booking) {
  const plain = booking.toJSON();
  plain.user = booking.user ? booking.user.toJSON() : String(booking.userId);
  plain.table = booking.table ? booking.table.toJSON() : String(booking.tableId);
  plain.equipment = (booking.equipmentItems || []).map((entry) => ({
    item: String(entry.equipmentId),
    name: entry.name,
    quantity: entry.quantity
  }));
  delete plain.equipmentItems;
  return plain;
}

function serializeMatch(match) {
  const plain = match.toJSON();
  plain.tournament = match.tournament ? match.tournament.toJSON() : String(match.tournamentId);
  plain.playerOne = match.playerOne ? match.playerOne.toJSON() : String(match.playerOneId);
  plain.playerTwo = match.playerTwo ? match.playerTwo.toJSON() : String(match.playerTwoId);
  plain.winner = match.winner ? match.winner.toJSON() : (match.winnerId ? String(match.winnerId) : null);
  plain.table = match.table ? match.table.toJSON() : (match.tableId ? String(match.tableId) : null);
  return plain;
}

function makeSessionCookie(res, user) {
  const token = jwt.sign(
    { sub: String(user.id) },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
  res.cookie(sessionCookie, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: sessionDurationMs
  });
}

const { authenticate, requireAdmin } = createAuthMiddleware({
  User,
  jwt,
  httpError,
  secret: process.env.JWT_SECRET
});

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Try again later.' }
});

function validateLocalDateTime(dateKey, timeKey, startAt, timezoneOffsetMinutes) {
  if (Number(timezoneOffsetMinutes) !== clubUtcOffsetMinutes) {
    throw httpError(400, 'Use the club time zone (Asia/Thimphu) for booking times.');
  }
  try {
    return parseLocalStart(dateKey, timeKey, startAt, clubUtcOffsetMinutes);
  } catch (error) {
    throw httpError(400, error.message);
  }
}

function validateBookingInput(body) {
  const tableId = requireId(body.tableId, 'table');
  const { dateKey, timeKey, durationHours, startAt } = body;
  const hours = Number(durationHours);
  let slotKeys;
  try {
    slotKeys = buildSlotKeys(dateKey, timeKey, hours);
  } catch (error) {
    throw httpError(400, error.message);
  }
  const parsedStart = validateLocalDateTime(dateKey, timeKey, startAt, body.timezoneOffsetMinutes);
  if (parsedStart.getTime() <= Date.now()) {
    throw httpError(400, 'Choose a future booking time.');
  }
  return { tableId, dateKey, timeKey, durationHours: hours, startAt: parsedStart, slotKeys };
}

async function resolveEquipment(requested) {
  if (requested === undefined) return [];
  if (!Array.isArray(requested) || requested.length > 10) throw httpError(400, 'Invalid equipment selection.');
  const ids = requested.map((item) => item && item.id);
  if (ids.some((id) => !validId(id))) throw httpError(400, 'Invalid equipment selection.');
  const numericIds = ids.map(Number);
  const uniqueIds = [...new Set(numericIds)];
  if (uniqueIds.length !== numericIds.length) throw httpError(400, 'An equipment item can only be selected once.');
  const items = await Equipment.findAll({
    where: { id: { [Op.in]: uniqueIds }, status: 'available', quantity: { [Op.gt]: 0 } }
  });
  if (items.length !== uniqueIds.length) throw httpError(400, 'One or more selected equipment items are unavailable.');
  return requested.map((request) => {
    const item = items.find((entry) => entry.id === Number(request.id));
    const quantity = Number(request.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > item.quantity) {
      throw httpError(400, `Choose a valid quantity for ${item.name}.`);
    }
    return { equipmentId: item.id, name: item.name, quantity };
  });
}

async function ensureBaseData() {
  const existingTables = await SnookerTable.count();
  if (existingTables === 0) {
    await SnookerTable.bulkCreate([1, 2, 3, 4].map((tableNumber) => ({
      tableNumber,
      name: `Table ${tableNumber}`
    })));
  }
  const existingEquipment = await Equipment.count();
  if (existingEquipment === 0) {
    await Equipment.bulkCreate([
      { name: 'Snooker cue', quantity: 8 },
      { name: 'Ball set', quantity: 4 }
    ]);
  }
}

app.post('/api/auth/register', authRateLimit, asyncRoute(async (req, res) => {
  const { name, email, password, phone = '', studentId = '' } = req.body;
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
    throw httpError(400, 'Enter a name between 2 and 100 characters.');
  }
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    throw httpError(400, 'Enter a valid email address.');
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    throw httpError(400, 'Password must be between 8 and 128 characters.');
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({
    name: name.trim(),
    email: email.trim().toLowerCase(),
    phone: String(phone).trim(),
    studentId: String(studentId).trim(),
    passwordHash,
    role: 'user'
  });
  makeSessionCookie(res, user);
  res.status(201).json({ user: publicUser(user) });
}));

app.post('/api/auth/login', authRateLimit, asyncRoute(async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const user = await User.scope('withSecrets').findOne({ where: { email } });
  if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) {
    throw httpError(401, 'Email or password is incorrect.');
  }
  makeSessionCookie(res, user);
  res.json({ user: publicUser(user) });
}));

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/'
  });
  res.json({ message: 'Signed out.' });
});

app.post('/api/auth/forgot-password', authRateLimit, asyncRoute(async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const user = await User.scope('withSecrets').findOne({ where: { email } });
  if (!user) return res.json({ message: 'If that account exists, a reset code will be sent.' });
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD || !process.env.SMTP_FROM) {
    throw httpError(503, 'Password reset email is not configured. Set SMTP settings in backend/.env.');
  }
  const otp = String(crypto.randomInt(100000, 1000000));
  user.resetOtpHash = await bcrypt.hash(otp, 10);
  user.resetOtpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await user.save();
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
  });
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: user.email,
    subject: 'Snooker Booking password reset code',
    text: `Your password reset code is ${otp}. It expires in 10 minutes.`
  });
  res.json({ message: 'If that account exists, a reset code will be sent.' });
}));

app.post('/api/auth/reset-password', authRateLimit, asyncRoute(async (req, res) => {
  const { email, otp, password } = req.body;
  if (typeof email !== 'string' || typeof otp !== 'string' || typeof password !== 'string' || password.length < 8 || password.length > 128) {
    throw httpError(400, 'Enter your email, six-digit code, and a password between 8 and 128 characters.');
  }
  const user = await User.scope('withSecrets').findOne({ where: { email: email.trim().toLowerCase() } });
  if (!user || !user.resetOtpHash || !user.resetOtpExpiresAt || new Date(user.resetOtpExpiresAt).getTime() < Date.now()
    || !(await bcrypt.compare(otp, user.resetOtpHash))) {
    throw httpError(400, 'The reset code is invalid or has expired.');
  }
  user.passwordHash = await bcrypt.hash(password, 12);
  user.resetOtpHash = null;
  user.resetOtpExpiresAt = null;
  await user.save();
  res.json({ message: 'Password updated. You can now sign in.' });
}));

app.get('/api/me', authenticate, (req, res) => res.json({ user: publicUser(req.user) }));

app.patch('/api/me', authenticate, asyncRoute(async (req, res) => {
  const fields = ['name', 'email', 'phone', 'studentId'];
  for (const field of fields) {
    if (req.body[field] !== undefined) {
      if (typeof req.body[field] !== 'string') throw httpError(400, `Invalid ${field}.`);
      req.user[field] = field === 'email' ? req.body[field].trim().toLowerCase() : req.body[field].trim();
    }
  }
  if (req.user.name.length < 2 || req.user.name.length > 100
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.user.email)) {
    throw httpError(400, 'Enter a valid name and email address.');
  }
  await req.user.save();
  res.json({ user: publicUser(req.user) });
}));

app.get('/api/tables', authenticate, asyncRoute(async (req, res) => {
  const tables = await SnookerTable.findAll({ order: [['tableNumber', 'ASC']] });
  const now = new Date();
  const windowStart = new Date(now.getTime() - 4 * 3600000);
  const [recentBookings, recentMatches] = await Promise.all([
    Booking.findAll({
      where: { status: 'approved', startAt: { [Op.between]: [windowStart, now] } },
      attributes: ['tableId', 'startAt', 'durationHours']
    }),
    Match.findAll({
      where: { status: 'scheduled', scheduledAt: { [Op.between]: [new Date(now.getTime() - 3600000), now] } },
      attributes: ['tableId', 'scheduledAt']
    })
  ]);
  const occupiedIds = new Set([
    ...recentBookings
      .filter((b) => new Date(b.startAt).getTime() + b.durationHours * 3600000 > now.getTime())
      .map((b) => b.tableId),
    ...recentMatches.filter((m) => m.tableId).map((m) => m.tableId)
  ]);
  res.json({
    tables: tables.map((table) => ({
      ...table.toJSON(),
      liveStatus: table.status === 'maintenance' ? 'maintenance'
        : occupiedIds.has(table.id) ? 'occupied' : 'available'
    }))
  });
}));

app.get('/api/tables/availability', authenticate, asyncRoute(async (req, res) => {
  const dateKey = String(req.query.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw httpError(400, 'Choose a valid date.');
  const date = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateKey) throw httpError(400, 'Choose a valid date.');
  const [tables, locks] = await Promise.all([
    SnookerTable.findAll({ order: [['tableNumber', 'ASC']] }),
    BookingSlot.findAll({
      where: { slotKey: { [Op.like]: `${dateKey}T%` } },
      attributes: ['tableId', 'slotKey']
    })
  ]);
  const slots = locks.reduce((result, lock) => {
    const tableId = String(lock.tableId);
    if (!result[tableId]) result[tableId] = [];
    result[tableId].push(lock.slotKey);
    return result;
  }, {});
  res.json({ tables, slots });
}));

app.get('/api/equipment', authenticate, asyncRoute(async (req, res) => {
  const equipment = await Equipment.findAll({ order: [['name', 'ASC']] });
  res.json({ equipment });
}));

app.post('/api/bookings', authenticate, asyncRoute(async (req, res) => {
  const bookingData = validateBookingInput(req.body);
  const table = await SnookerTable.findByPk(bookingData.tableId);
  if (!table || table.status === 'maintenance') throw httpError(400, 'This table is unavailable for bookings.');
  const equipment = await resolveEquipment(req.body.equipment);

  let createdId;
  try {
    await sequelize.transaction(async (t) => {
      const booking = await Booking.create({
        userId: req.user.id,
        tableId: table.id,
        startAt: bookingData.startAt,
        dateKey: bookingData.dateKey,
        timeKey: bookingData.timeKey,
        durationHours: bookingData.durationHours,
        slotKeys: bookingData.slotKeys
      }, { transaction: t });
      createdId = booking.id;

      if (equipment.length) {
        await BookingEquipment.bulkCreate(
          equipment.map((eq) => ({ bookingId: booking.id, ...eq })),
          { transaction: t }
        );
      }

      await BookingSlot.bulkCreate(
        bookingData.slotKeys.map((slotKey) => ({
          tableId: table.id,
          slotKey,
          bookingId: booking.id
        })),
        { transaction: t }
      );
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw httpError(409, 'That table has already been requested for one or more selected hours.');
    }
    throw error;
  }

  await createNotification(req.user.id, `Booking request for ${table.name} submitted for admin approval.`);
  const fullBooking = await Booking.findByPk(createdId, {
    include: [
      { model: SnookerTable, as: 'table', attributes: ['id', 'name', 'tableNumber'] },
      { model: BookingEquipment, as: 'equipmentItems' }
    ]
  });
  res.status(201).json({ booking: serializeBooking(fullBooking) });
}));

app.get('/api/bookings', authenticate, asyncRoute(async (req, res) => {
  const where = req.user.role === 'admin' ? {} : { userId: req.user.id };
  if (req.query.status && ['pending', 'approved', 'rejected', 'cancelled'].includes(req.query.status)) {
    where.status = req.query.status;
  }
  const bookings = await Booking.findAll({
    where,
    include: [
      { model: User, as: 'user', attributes: ['id', 'name', 'email', 'studentId'] },
      { model: SnookerTable, as: 'table', attributes: ['id', 'name', 'tableNumber'] },
      { model: BookingEquipment, as: 'equipmentItems' }
    ],
    order: [['startAt', 'DESC']],
    limit: 250
  });
  const bookingIds = bookings.map((b) => b.id);
  const reviewedRows = (req.user.role === 'admin' || !bookingIds.length)
    ? []
    : await Feedback.findAll({
        where: { userId: req.user.id, bookingId: { [Op.in]: bookingIds } },
        attributes: ['bookingId']
      });
  res.json({
    bookings: bookings.map(serializeBooking),
    reviewedBookingIds: reviewedRows.map((row) => String(row.bookingId))
  });
}));

app.patch('/api/bookings/:id', authenticate, asyncRoute(async (req, res) => {
  const bookingId = requireId(req.params.id, 'booking');
  const booking = await Booking.findByPk(bookingId);
  if (!booking) throw httpError(404, 'Booking not found.');
  if (req.user.role !== 'admin' && booking.userId !== req.user.id) {
    throw httpError(403, 'You can only edit your own bookings.');
  }
  if (booking.status !== 'pending') throw httpError(409, 'Only pending bookings can be edited.');

  const bookingData = validateBookingInput(req.body);
  const table = await SnookerTable.findByPk(bookingData.tableId);
  if (!table || table.status === 'maintenance') throw httpError(400, 'This table is unavailable for bookings.');
  const equipment = await resolveEquipment(req.body.equipment);

  try {
    await sequelize.transaction(async (t) => {
      await BookingSlot.destroy({ where: { bookingId: booking.id }, transaction: t });
      await BookingSlot.bulkCreate(
        bookingData.slotKeys.map((slotKey) => ({
          tableId: table.id,
          slotKey,
          bookingId: booking.id
        })),
        { transaction: t }
      );
      await BookingEquipment.destroy({ where: { bookingId: booking.id }, transaction: t });
      if (equipment.length) {
        await BookingEquipment.bulkCreate(
          equipment.map((eq) => ({ bookingId: booking.id, ...eq })),
          { transaction: t }
        );
      }
      booking.tableId = table.id;
      booking.startAt = bookingData.startAt;
      booking.dateKey = bookingData.dateKey;
      booking.timeKey = bookingData.timeKey;
      booking.durationHours = bookingData.durationHours;
      booking.slotKeys = bookingData.slotKeys;
      await booking.save({ transaction: t });
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw httpError(409, 'That table has already been requested for one or more selected hours.');
    }
    throw error;
  }

  await createNotification(booking.userId, `Your booking request was updated for ${table.name}.`);
  const updated = await Booking.findByPk(booking.id, {
    include: [
      { model: SnookerTable, as: 'table', attributes: ['id', 'name', 'tableNumber'] },
      { model: BookingEquipment, as: 'equipmentItems' }
    ]
  });
  res.json({ booking: serializeBooking(updated) });
}));

app.delete('/api/bookings/:id', authenticate, asyncRoute(async (req, res) => {
  const bookingId = requireId(req.params.id, 'booking');
  const booking = await Booking.findByPk(bookingId);
  if (!booking) throw httpError(404, 'Booking not found.');
  if (req.user.role !== 'admin' && booking.userId !== req.user.id) {
    throw httpError(403, 'You can only cancel your own bookings.');
  }
  if (!['pending', 'approved'].includes(booking.status)) throw httpError(409, 'This booking can no longer be cancelled.');
  if (new Date(booking.startAt).getTime() <= Date.now()) throw httpError(409, 'A booking that has already started cannot be cancelled.');

  await sequelize.transaction(async (t) => {
    booking.status = 'cancelled';
    await booking.save({ transaction: t });
    await BookingSlot.destroy({ where: { bookingId: booking.id }, transaction: t });
  });

  await createNotification(booking.userId, 'Your booking was cancelled.');
  res.json({ message: 'Booking cancelled.' });
}));

app.get('/api/notifications', authenticate, asyncRoute(async (req, res) => {
  const notifications = await Notification.findAll({
    where: { userId: req.user.id },
    order: [['createdAt', 'DESC']],
    limit: 50
  });
  res.json({ notifications });
}));

app.patch('/api/notifications/read', authenticate, asyncRoute(async (req, res) => {
  await Notification.update({ readAt: new Date() }, { where: { userId: req.user.id, readAt: null } });
  res.json({ message: 'Notifications marked as read.' });
}));

app.post('/api/feedback', authenticate, asyncRoute(async (req, res) => {
  const bookingId = requireId(req.body.bookingId, 'booking');
  const booking = await Booking.findOne({
    where: { id: bookingId, userId: req.user.id, status: 'approved' }
  });
  if (!booking) {
    throw httpError(400, 'Feedback can be submitted for an approved booking.');
  }
  const score = Number(req.body.rating);
  const comment = req.body.comment ?? '';
  if (!Number.isInteger(score) || score < 1 || score > 5 || typeof comment !== 'string' || comment.length > 1000) {
    throw httpError(400, 'Enter a rating from 1 to 5 and a comment of at most 1000 characters.');
  }
  const feedback = await Feedback.create({
    userId: req.user.id,
    bookingId: booking.id,
    tableId: booking.tableId,
    rating: score,
    comment: comment.trim()
  });
  res.status(201).json({ feedback });
}));

app.get('/api/admin/summary', authenticate, requireAdmin, asyncRoute(async (req, res) => {
  const [pendingBookings, totalBookings, activeTables, upcomingMatches, users] = await Promise.all([
    Booking.count({ where: { status: 'pending' } }),
    Booking.count(),
    SnookerTable.count({ where: { status: 'available' } }),
    Match.count({ where: { status: 'scheduled', scheduledAt: { [Op.gte]: new Date() } } }),
    User.count({ where: { role: 'user', isActive: true } })
  ]);
  res.json({ pendingBookings, totalBookings, activeTables, upcomingMatches, users });
}));

app.post('/api/admin/tables', authenticate, requireAdmin, asyncRoute(async (req, res) => {
  const tableNumber = Number(req.body.tableNumber);
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  if (!Number.isInteger(tableNumber) || tableNumber < 1 || name.length < 2 || name.length > 80) {
    throw httpError(400, 'Enter a positive table number and a name between 2 and 80 characters.');
  }
  const table = await SnookerTable.create({ tableNumber, name });
  res.status(201).json({ table });
}));

app.patch('/api/admin/tables/:id', authenticate, requireAdmin, asyncRoute(async (req, res) => {
  const tableId = requireId(req.params.id, 'table');
  const table = await SnookerTable.findByPk(tableId);
  if (!table) throw httpError(404, 'Table not found.');
  if (req.body.status !== undefined) {
    if (!['available', 'maintenance'].includes(req.body.status)) throw httpError(400, 'Invalid table status.');
    table.status = req.body.status;
  }
  if (req.body.name !== undefined) {
    if (typeof req.body.name !== 'string' || req.body.name.trim().length < 2 || req.body.name.trim().length > 80) {
      throw httpError(400, 'Table name must be between 2 and 80 characters.');
    }
    table.name = req.body.name.trim();
  }
  if (req.body.maintenanceNote !== undefined) table.maintenanceNote = String(req.body.maintenanceNote).trim().slice(0, 300);
  await table.save();
  res.json({ table });
}));

app.post('/api/admin/equipment', authenticate, requireAdmin, asyncRoute(async (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const quantity = Number(req.body.quantity);
  if (name.length < 2 || name.length > 100 || !Number.isInteger(quantity) || quantity < 0) {
    throw httpError(400, 'Enter an equipment name and a non-negative whole-number quantity.');
  }
  const equipment = await Equipment.create({ name, quantity, note: String(req.body.note || '').trim().slice(0, 300) });
  res.status(201).json({ equipment });
}));

app.patch('/api/admin/equipment/:id', authenticate, requireAdmin, asyncRoute(async (req, res) => {
  const equipmentId = requireId(req.params.id, 'equipment item');
  const equipment = await Equipment.findByPk(equipmentId);
  if (!equipment) throw httpError(404, 'Equipment item not found.');
  if (req.body.quantity !== undefined) {
    const quantity = Number(req.body.quantity);
    if (!Number.isInteger(quantity) || quantity < 0) throw httpError(400, 'Quantity must be a non-negative whole number.');
    equipment.quantity = quantity;
  }
  if (req.body.status !== undefined) {
    if (!['available', 'maintenance'].includes(req.body.status)) throw httpError(400, 'Invalid equipment status.');
    equipment.status = req.body.status;
  }
  if (req.body.note !== undefined) equipment.note = String(req.body.note).trim().slice(0, 300);
  await equipment.save();
  res.json({ equipment });
}));

app.patch('/api/admin/bookings/:id', authenticate, requireAdmin, asyncRoute(async (req, res) => {
  const bookingId = requireId(req.params.id, 'booking');
  const booking = await Booking.findByPk(bookingId);
  if (!booking) throw httpError(404, 'Booking not found.');
  if (req.body.paymentStatus !== undefined) {
    if (!['unpaid', 'paid'].includes(req.body.paymentStatus)) throw httpError(400, 'Invalid payment status.');
    if (booking.status !== 'approved') throw httpError(409, 'Only approved bookings can be marked as paid.');
    booking.paymentStatus = req.body.paymentStatus;
    await booking.save();
    await createNotification(booking.userId, `Your booking payment was marked ${booking.paymentStatus}.`);
    return res.json({ booking });
  }
  if (!['approved', 'rejected'].includes(req.body.status) || booking.status !== 'pending') {
    throw httpError(409, 'Only pending bookings can be approved or rejected.');
  }
  if (new Date(booking.startAt).getTime() <= Date.now() && req.body.status === 'approved') {
    throw httpError(409, 'A booking that has already started cannot be approved.');
  }
  await sequelize.transaction(async (t) => {
    booking.status = req.body.status;
    booking.adminNote = typeof req.body.adminNote === 'string' ? req.body.adminNote.trim().slice(0, 300) : '';
    await booking.save({ transaction: t });
    if (booking.status === 'rejected') {
      await BookingSlot.destroy({ where: { bookingId: booking.id }, transaction: t });
    }
  });
  await createNotification(booking.userId, `Your booking request was ${booking.status}.`);
  res.json({ booking });
}));

app.get('/api/admin/feedback', authenticate, requireAdmin, asyncRoute(async (req, res) => {
  const feedback = await Feedback.findAll({
    include: [
      { model: User, as: 'user', attributes: ['id', 'name', 'email'] },
      { model: SnookerTable, as: 'table', attributes: ['id', 'name', 'tableNumber'] }
    ],
    order: [['createdAt', 'DESC']],
    limit: 250
  });
  res.json({ feedback });
}));

app.get('/api/admin/reports', authenticate, requireAdmin, asyncRoute(async (req, res) => {
  const [statusRows, usageRows, recentBookings, ratingRow] = await Promise.all([
    Booking.findAll({
      attributes: ['status', [fn('COUNT', col('id')), 'count']],
      group: ['status'],
      raw: true
    }),
    Booking.findAll({
      where: { status: 'approved' },
      attributes: [
        'tableId',
        [fn('COUNT', col('Booking.id')), 'count'],
        [fn('SUM', col('duration_hours')), 'hours']
      ],
      include: [{ model: SnookerTable, as: 'table', attributes: ['id', 'name', 'tableNumber'] }],
      group: ['tableId', 'table.id'],
      order: [[fn('COUNT', col('Booking.id')), 'DESC']],
      limit: 10
    }),
    Booking.findAll({
      include: [
        { model: User, as: 'user', attributes: ['id', 'name'] },
        { model: SnookerTable, as: 'table', attributes: ['id', 'name'] }
      ],
      order: [['createdAt', 'DESC']],
      limit: 20
    }),
    Feedback.findOne({
      attributes: [[fn('AVG', col('rating')), 'average'], [fn('COUNT', col('id')), 'count']],
      raw: true
    })
  ]);

  const statuses = statusRows.map((row) => ({ _id: row.status, count: Number(row.count) }));
  const tableUsage = usageRows.map((row) => ({
    _id: String(row.tableId),
    count: Number(row.get('count')),
    hours: Number(row.get('hours') || 0),
    table: row.table ? row.table.toJSON() : null
  }));

  res.json({
    statuses,
    tableUsage,
    recentBookings: recentBookings.map(serializeBooking),
    rating: {
      average: Number(ratingRow?.average || 0),
      count: Number(ratingRow?.count || 0)
    }
  });
}));

app.get('/api/tournaments', authenticate, asyncRoute(async (req, res) => {
  const [tournaments, matches] = await Promise.all([
    Tournament.findAll({
      include: [{ model: User, as: 'participants', attributes: ['id', 'name', 'studentId'], through: { attributes: [] } }],
      order: [['startDate', 'ASC']],
      limit: 100
    }),
    Match.findAll({
      include: [
        { model: User, as: 'playerOne', attributes: ['id', 'name'] },
        { model: User, as: 'playerTwo', attributes: ['id', 'name'] },
        { model: User, as: 'winner', attributes: ['id', 'name'] },
        { model: SnookerTable, as: 'table', attributes: ['id', 'name', 'tableNumber'] }
      ],
      order: [['scheduledAt', 'ASC']]
    })
  ]);
  res.json({
    tournaments,
    matches: matches.map(serializeMatch)
  });
}));

app.post('/api/tournaments/:id/join', authenticate, asyncRoute(async (req, res) => {
  const tournamentId = requireId(req.params.id, 'tournament');
  await sequelize.transaction(async (t) => {
    const tournament = await Tournament.findByPk(tournamentId, { transaction: t });
    if (!tournament || !tournament.registrationOpen) {
      throw httpError(409, 'Registration is closed, full, or you have already joined.');
    }
    const existing = await TournamentParticipant.findOne({
      where: { tournamentId, userId: req.user.id },
      transaction: t
    });
    const currentCount = await TournamentParticipant.count({ where: { tournamentId }, transaction: t });
    if (existing || currentCount >= tournament.playerLimit) {
      throw httpError(409, 'Registration is closed, full, or you have already joined.');
    }
    await TournamentParticipant.create({ tournamentId, userId: req.user.id }, { transaction: t });
  });
  const updated = await Tournament.findByPk(tournamentId, {
    include: [{ model: User, as: 'participants', attributes: ['id', 'name', 'studentId'], through: { attributes: [] } }]
  });
  res.json({ tournament: updated });
}));

app.post('/api/admin/tournaments', authenticate, requireAdmin, asyncRoute(async (req, res) => {
  const { name, description = '', startDate, playerLimit = 16 } = req.body;
  const limit = Number(playerLimit);
  const date = new Date(startDate);
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 120
    || Number.isNaN(date.getTime()) || !Number.isInteger(limit) || limit < 2 || limit > 128) {
    throw httpError(400, 'Enter a tournament name, valid start date, and player limit from 2 to 128.');
  }
  const tournament = await Tournament.create({
    name: name.trim(),
    description: String(description).trim().slice(0, 1000),
    startDate: date,
    playerLimit: limit
  });
  res.status(201).json({ tournament });
}));

app.patch('/api/admin/tournaments/:id', authenticate, requireAdmin, asyncRoute(async (req, res) => {
  const tournamentId = requireId(req.params.id, 'tournament');
  const tournament = await Tournament.findByPk(tournamentId);
  if (!tournament) throw httpError(404, 'Tournament not found.');
  if (req.body.registrationOpen !== undefined) tournament.registrationOpen = Boolean(req.body.registrationOpen);
  if (req.body.description !== undefined) tournament.description = String(req.body.description).trim().slice(0, 1000);
  await tournament.save();
  res.json({ tournament });
}));

app.post('/api/admin/tournaments/:id/schedule', authenticate, requireAdmin, asyncRoute(async (req, res) => {
  const tournamentId = requireId(req.params.id, 'tournament');
  const tournament = await Tournament.findByPk(tournamentId, {
    include: [{ model: User, as: 'participants', attributes: ['id', 'name'] }]
  });
  if (!tournament) throw httpError(404, 'Tournament not found.');
  if (tournament.participants.length < 2) {
    throw httpError(409, 'At least two players must register before generating matches.');
  }
  const existing = await Match.findAll({ where: { tournamentId: tournament.id } });
  if (existing.some((match) => match.status === 'completed')) {
    throw httpError(409, 'A tournament with completed matches cannot have its fixtures regenerated.');
  }

  let matches = [];
  await sequelize.transaction(async (t) => {
    const existingIds = existing.map((m) => m.id);
    if (existingIds.length) {
      await BookingSlot.destroy({ where: { matchId: { [Op.in]: existingIds } }, transaction: t });
    }
    await Match.destroy({ where: { tournamentId: tournament.id }, transaction: t });

    const fixtures = [];
    for (let first = 0; first < tournament.participants.length; first += 1) {
      for (let second = first + 1; second < tournament.participants.length; second += 1) {
        fixtures.push({
          tournamentId: tournament.id,
          playerOneId: tournament.participants[first].id,
          playerTwoId: tournament.participants[second].id
        });
      }
    }
    matches = await Match.bulkCreate(fixtures, { transaction: t });
    tournament.registrationOpen = false;
    await tournament.save({ transaction: t });
  });

  res.status(201).json({ matches: matches.map(serializeMatch) });
}));

app.patch('/api/admin/matches/:id', authenticate, requireAdmin, asyncRoute(async (req, res) => {
  const matchId = requireId(req.params.id, 'match');
  const match = await Match.findByPk(matchId);
  if (!match) throw httpError(404, 'Match not found.');
  if (match.status === 'completed') throw httpError(409, 'Completed match results cannot be changed.');

  if (req.body.scheduledAt !== undefined) {
    match.scheduledAt = validateLocalDateTime(
      req.body.dateKey,
      req.body.timeKey,
      req.body.scheduledAt,
      req.body.timezoneOffsetMinutes
    );
    match.dateKey = req.body.dateKey;
    match.timeKey = req.body.timeKey;
  }
  if (req.body.tableId !== undefined) {
    const tableId = requireId(req.body.tableId, 'table');
    const table = await SnookerTable.findByPk(tableId);
    if (!table || table.status === 'maintenance') throw httpError(400, 'Choose an available table.');
    match.tableId = table.id;
  }
  const hasScore = req.body.scoreOne !== undefined || req.body.scoreTwo !== undefined;
  if (hasScore) {
    const scoreOne = Number(req.body.scoreOne);
    const scoreTwo = Number(req.body.scoreTwo);
    if (!Number.isInteger(scoreOne) || !Number.isInteger(scoreTwo) || scoreOne < 0 || scoreTwo < 0 || scoreOne === scoreTwo) {
      throw httpError(400, 'Enter two different non-negative whole-number scores to record a winner.');
    }
    match.scoreOne = scoreOne;
    match.scoreTwo = scoreTwo;
    match.winnerId = scoreOne > scoreTwo ? match.playerOneId : match.playerTwoId;
    match.status = 'completed';
    match.verifiedById = req.user.id;
  }

  try {
    await sequelize.transaction(async (t) => {
      await BookingSlot.destroy({ where: { matchId: match.id }, transaction: t });
      if (match.tableId && match.dateKey && match.timeKey) {
        await BookingSlot.create({
          tableId: match.tableId,
          slotKey: `${match.dateKey}T${match.timeKey}`,
          matchId: match.id
        }, { transaction: t });
      }
      await match.save({ transaction: t });
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw httpError(409, 'That table is already reserved for the selected match hour.');
    }
    throw error;
  }

  res.json({ match: serializeMatch(match) });
}));

app.use('/api', (req, res, next) => next(httpError(404, 'API endpoint not found.')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next(httpError(404, 'API endpoint not found.'));
  return res.sendFile(path.resolve(__dirname, '../../frontend/index.html'));
});

app.use(errorHandler);

async function start() {
  await connectDatabase();
  await ensureBaseData();
  app.listen(port, () => console.log(`Snooker Booking is running at http://localhost:${port}`));
}

if (require.main === module) {
  start().catch((error) => {
    console.error('Unable to start Snooker Booking:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { app, start };
