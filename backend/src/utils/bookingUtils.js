function buildSlotKeys(dateKey, timeKey, durationHours) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !/^(?:[01]\d|2[0-3]):00$/.test(timeKey)) {
    throw new Error('Choose a valid date and an on-the-hour start time.');
  }
  if (!Number.isInteger(durationHours) || durationHours < 1 || durationHours > 4) {
    throw new Error('Booking duration must be between 1 and 4 hours.');
  }

  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error('Choose a valid calendar date.');
  }

  const startHour = Number(timeKey.slice(0, 2));
  if (startHour + durationHours > 24) {
    throw new Error('A booking cannot continue into the next day.');
  }

  return Array.from({ length: durationHours }, (_, offset) => {
    const hour = String(startHour + offset).padStart(2, '0');
    return `${dateKey}T${hour}:00`;
  });
}

function parseLocalStart(dateKey, timeKey, startAt, timezoneOffsetMinutes) {
  buildSlotKeys(dateKey, timeKey, 1);
  const offset = Number(timezoneOffsetMinutes);
  if (!Number.isInteger(offset) || offset < -840 || offset > 840) {
    throw new Error('Invalid local time zone.');
  }
  const parsedStart = new Date(startAt);
  if (!startAt || Number.isNaN(parsedStart.getTime())) throw new Error('Choose a valid date and time.');
  const [year, month, day] = dateKey.split('-').map(Number);
  const hour = Number(timeKey.slice(0, 2));
  const expectedUtc = Date.UTC(year, month - 1, day, hour) + offset * 60 * 1000;
  if (parsedStart.getTime() !== expectedUtc) throw new Error('Booking date and time do not match.');
  return parsedStart;
}

function isDuplicateKeyError(error) {
  if (!error) return false;
  const code = error.code || error.parent?.code || error.original?.code;
  return error.name === 'SequelizeUniqueConstraintError'
    || code === 'SQLITE_CONSTRAINT'
    || code === 'SQLITE_CONSTRAINT_UNIQUE'
    || code === '23505'
    || code === 'ER_DUP_ENTRY';
}

module.exports = { buildSlotKeys, parseLocalStart, isDuplicateKeyError };
