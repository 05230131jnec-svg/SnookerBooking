const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

function withMongoIdAlias(model) {
  const origToJSON = model.prototype.toJSON;
  model.prototype.toJSON = function toJSON() {
    const values = origToJSON ? origToJSON.call(this) : { ...this.get() };
    if (values.id !== undefined) values._id = String(values.id);
    return values;
  };
  Object.defineProperty(model.prototype, '_id', {
    get() {
      return this.id !== undefined && this.id !== null ? String(this.id) : undefined;
    }
  });
}

const User = sequelize.define('User', {
  name: { type: DataTypes.STRING(100), allowNull: false },
  email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
  phone: { type: DataTypes.STRING(30), allowNull: false, defaultValue: '' },
  studentId: { type: DataTypes.STRING(50), allowNull: false, defaultValue: '' },
  passwordHash: { type: DataTypes.STRING(255), allowNull: false },
  role: { type: DataTypes.ENUM('user', 'admin'), allowNull: false, defaultValue: 'user' },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  resetOtpHash: { type: DataTypes.STRING(255), allowNull: true },
  resetOtpExpiresAt: { type: DataTypes.DATE, allowNull: true }
}, {
  tableName: 'users',
  defaultScope: {
    attributes: { exclude: ['passwordHash', 'resetOtpHash', 'resetOtpExpiresAt'] }
  },
  scopes: {
    withSecrets: { attributes: {} }
  }
});

const SnookerTable = sequelize.define('SnookerTable', {
  tableNumber: { type: DataTypes.INTEGER, allowNull: false, unique: true, validate: { min: 1 } },
  name: { type: DataTypes.STRING(80), allowNull: false },
  status: { type: DataTypes.ENUM('available', 'maintenance'), allowNull: false, defaultValue: 'available' },
  maintenanceNote: { type: DataTypes.STRING(300), allowNull: false, defaultValue: '' }
}, { tableName: 'snooker_tables' });

const Booking = sequelize.define('Booking', {
  userId: { type: DataTypes.INTEGER, allowNull: false },
  tableId: { type: DataTypes.INTEGER, allowNull: false },
  startAt: { type: DataTypes.DATE, allowNull: false },
  dateKey: { type: DataTypes.STRING(10), allowNull: false },
  timeKey: { type: DataTypes.STRING(5), allowNull: false },
  durationHours: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1, max: 4 } },
  slotKeys: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected', 'cancelled'),
    allowNull: false,
    defaultValue: 'pending'
  },
  paymentMethod: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pay-at-desk' },
  paymentStatus: { type: DataTypes.ENUM('unpaid', 'paid'), allowNull: false, defaultValue: 'unpaid' },
  adminNote: { type: DataTypes.STRING(300), allowNull: false, defaultValue: '' }
}, {
  tableName: 'bookings',
  indexes: [{ fields: ['user_id'] }, { fields: ['start_at'] }, { fields: ['status'] }]
});

const Equipment = sequelize.define('Equipment', {
  name: { type: DataTypes.STRING(100), allowNull: false },
  quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, validate: { min: 0 } },
  status: { type: DataTypes.ENUM('available', 'maintenance'), allowNull: false, defaultValue: 'available' },
  note: { type: DataTypes.STRING(300), allowNull: false, defaultValue: '' }
}, { tableName: 'equipment' });

const BookingEquipment = sequelize.define('BookingEquipment', {
  bookingId: { type: DataTypes.INTEGER, allowNull: false },
  equipmentId: { type: DataTypes.INTEGER, allowNull: false },
  name: { type: DataTypes.STRING(100), allowNull: false },
  quantity: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1 } }
}, {
  tableName: 'booking_equipment',
  timestamps: false,
  indexes: [{ unique: true, fields: ['booking_id', 'equipment_id'] }]
});

const BookingSlot = sequelize.define('BookingSlot', {
  tableId: { type: DataTypes.INTEGER, allowNull: false },
  slotKey: { type: DataTypes.STRING(20), allowNull: false },
  bookingId: { type: DataTypes.INTEGER, allowNull: true },
  matchId: { type: DataTypes.INTEGER, allowNull: true }
}, {
  tableName: 'booking_slots',
  indexes: [
    { unique: true, fields: ['table_id', 'slot_key'] },
    { fields: ['booking_id'] }
  ]
});

const Tournament = sequelize.define('Tournament', {
  name: { type: DataTypes.STRING(120), allowNull: false },
  description: { type: DataTypes.STRING(1000), allowNull: false, defaultValue: '' },
  startDate: { type: DataTypes.DATE, allowNull: false },
  playerLimit: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 16, validate: { min: 2, max: 128 } },
  registrationOpen: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
}, { tableName: 'tournaments' });

const TournamentParticipant = sequelize.define('TournamentParticipant', {
  tournamentId: { type: DataTypes.INTEGER, primaryKey: true },
  userId: { type: DataTypes.INTEGER, primaryKey: true }
}, { tableName: 'tournament_participants', updatedAt: false });

const Match = sequelize.define('Match', {
  tournamentId: { type: DataTypes.INTEGER, allowNull: false },
  playerOneId: { type: DataTypes.INTEGER, allowNull: false },
  playerTwoId: { type: DataTypes.INTEGER, allowNull: false },
  scheduledAt: { type: DataTypes.DATE, allowNull: true },
  tableId: { type: DataTypes.INTEGER, allowNull: true },
  dateKey: { type: DataTypes.STRING(10), allowNull: true },
  timeKey: { type: DataTypes.STRING(5), allowNull: true },
  scoreOne: { type: DataTypes.INTEGER, allowNull: true, validate: { min: 0 } },
  scoreTwo: { type: DataTypes.INTEGER, allowNull: true, validate: { min: 0 } },
  winnerId: { type: DataTypes.INTEGER, allowNull: true },
  status: { type: DataTypes.ENUM('scheduled', 'completed'), allowNull: false, defaultValue: 'scheduled' },
  verifiedById: { type: DataTypes.INTEGER, allowNull: true }
}, {
  tableName: 'matches',
  indexes: [{ fields: ['tournament_id'] }]
});

const Feedback = sequelize.define('Feedback', {
  userId: { type: DataTypes.INTEGER, allowNull: false },
  bookingId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
  tableId: { type: DataTypes.INTEGER, allowNull: false },
  rating: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1, max: 5 } },
  comment: { type: DataTypes.STRING(1000), allowNull: false, defaultValue: '' }
}, { tableName: 'feedback' });

const Notification = sequelize.define('Notification', {
  userId: { type: DataTypes.INTEGER, allowNull: false },
  message: { type: DataTypes.STRING(300), allowNull: false },
  readAt: { type: DataTypes.DATE, allowNull: true }
}, {
  tableName: 'notifications',
  indexes: [{ fields: ['user_id'] }]
});

Booking.belongsTo(User, { as: 'user', foreignKey: 'userId' });
User.hasMany(Booking, { foreignKey: 'userId' });

Booking.belongsTo(SnookerTable, { as: 'table', foreignKey: 'tableId' });
SnookerTable.hasMany(Booking, { foreignKey: 'tableId' });

Booking.hasMany(BookingEquipment, { as: 'equipmentItems', foreignKey: 'bookingId', onDelete: 'CASCADE' });
BookingEquipment.belongsTo(Booking, { foreignKey: 'bookingId' });
BookingEquipment.belongsTo(Equipment, { as: 'equipment', foreignKey: 'equipmentId' });

BookingSlot.belongsTo(SnookerTable, { as: 'table', foreignKey: 'tableId' });
BookingSlot.belongsTo(Booking, { as: 'booking', foreignKey: 'bookingId' });
BookingSlot.belongsTo(Match, { as: 'match', foreignKey: 'matchId' });

Tournament.belongsToMany(User, {
  through: TournamentParticipant,
  as: 'participants',
  foreignKey: 'tournamentId',
  otherKey: 'userId'
});
User.belongsToMany(Tournament, {
  through: TournamentParticipant,
  as: 'tournaments',
  foreignKey: 'userId',
  otherKey: 'tournamentId'
});

Match.belongsTo(Tournament, { as: 'tournament', foreignKey: 'tournamentId' });
Tournament.hasMany(Match, { as: 'matches', foreignKey: 'tournamentId' });
Match.belongsTo(User, { as: 'playerOne', foreignKey: 'playerOneId' });
Match.belongsTo(User, { as: 'playerTwo', foreignKey: 'playerTwoId' });
Match.belongsTo(User, { as: 'winner', foreignKey: 'winnerId' });
Match.belongsTo(User, { as: 'verifiedBy', foreignKey: 'verifiedById' });
Match.belongsTo(SnookerTable, { as: 'table', foreignKey: 'tableId' });

Feedback.belongsTo(User, { as: 'user', foreignKey: 'userId' });
Feedback.belongsTo(Booking, { as: 'booking', foreignKey: 'bookingId' });
Feedback.belongsTo(SnookerTable, { as: 'table', foreignKey: 'tableId' });

Notification.belongsTo(User, { as: 'user', foreignKey: 'userId' });

[
  User, SnookerTable, Booking, Equipment, BookingEquipment,
  BookingSlot, Tournament, Match, Feedback, Notification
].forEach(withMongoIdAlias);

module.exports = {
  sequelize,
  User,
  SnookerTable,
  Booking,
  BookingEquipment,
  BookingSlot,
  Equipment,
  Tournament,
  TournamentParticipant,
  Match,
  Feedback,
  Notification
};
