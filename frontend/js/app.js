const app = document.querySelector('#app');
const toast = document.querySelector('#toast');
const clubUtcOffsetMinutes = -360;
const currentPage = document.body.dataset.page || 'login';
const { api, formData } = window.SnookerApi;
const { escapeHtml, localDateTimeValue, localDate, dateTime, statusPill, emptyState } = window.SnookerUtils;

const state = {
  user: null,
  page: currentPage,
  authView: 'login',
  editingBooking: null,
  data: {},
  availability: null
};

const userNavigation = [
  ['dashboard', '⌂', 'Overview'],
  ['book', '＋', 'Book a table'],
  ['bookings', '▤', 'My bookings'],
  ['tournaments', '♧', 'Tournaments'],
  ['feedback', '☆', 'Feedback'],
  ['notifications', '◉', 'Notifications'],
  ['profile', '◎', 'My profile']
];

const adminNavigation = [
  ['dashboard', '⌂', 'Dashboard'],
  ['bookings', '▤', 'Bookings'],
  ['tables', '▦', 'Tables'],
  ['equipment', '◈', 'Equipment'],
  ['tournaments', '♧', 'Tournaments'],
  ['feedback', '☆', 'Feedback'],
  ['reports', '▥', 'Reports']
];

function showToast(message, isError = false) {
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove('show'), 3800);
}

function offlineCount() {
  const queue = JSON.parse(localStorage.getItem('snooker-offline-bookings') || '[]');
  return queue.filter((item) => item.userId === state.user?.id).length;
}

function authPage() {
  const view = currentPage;
  state.authView = view;
  const isRegister = view === 'register';
  const title = view === 'login' ? 'Welcome back'
    : isRegister ? 'Join the club'
      : view === 'forgot' ? 'Reset your password' : 'Enter your reset code';
  const description = view === 'login' ? 'Sign in to find your next table.'
    : isRegister ? 'Create your player account to book a table.'
      : view === 'forgot' ? 'We will email you a one-time reset code.'
        : 'Enter the six-digit code from your email and choose a new password.';

  let fields = '';
  if (isRegister) {
    fields = `
      <div class="field"><label for="name">Full name</label><input id="name" name="name" autocomplete="name" required minlength="2" maxlength="100"></div>
      <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required></div>
      <div class="field"><label for="studentId">Student or staff ID <span class="muted">(optional)</span></label><input id="studentId" name="studentId" maxlength="50"></div>
      <div class="field"><label for="phone">Phone <span class="muted">(optional)</span></label><input id="phone" name="phone" type="tel" autocomplete="tel" maxlength="30"></div>
      <div class="field"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="new-password" required minlength="8" maxlength="128"></div>
    `;
  } else if (view === 'forgot') {
    fields = `<div class="field"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required></div>`;
  } else if (view === 'reset') {
    fields = `
      <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" value="${escapeHtml(sessionStorage.getItem('snooker-reset-email') || '')}" required></div>
      <div class="field"><label for="otp">Reset code</label><input id="otp" name="otp" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required></div>
      <div class="field"><label for="password">New password</label><input id="password" name="password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></div>
    `;
  } else {
    fields = `
      <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required></div>
      <div class="field"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required></div>
    `;
  }

  const links = view === 'login'
    ? `<div class="auth-switch"><a class="link-button" href="/public/register.html">Create an account</a><a class="link-button" href="/public/forgot-password.html">Forgot password?</a></div>`
    : view === 'forgot'
      ? `<div class="auth-switch"><span></span><a class="link-button" href="/public/login.html">Back to sign in</a></div>`
      : view === 'reset'
        ? `<div class="auth-switch"><span></span><a class="link-button" href="/public/login.html">Back to sign in</a></div>`
        : `<div class="auth-switch"><span></span><a class="link-button" href="/public/login.html">Back to sign in</a></div>`;

  return `
    <div class="auth-layout">
      <section class="auth-art">
        <div class="auth-copy">
          <span class="eyebrow">The club, at your fingertips</span>
          <h1>Make time<br>for a good frame.</h1>
          <p>Find an open table, reserve your playing time, and stay up to date from anywhere.</p>
        </div>
      </section>
      <main class="auth-panel">
        <section class="auth-card">
          <div class="brand-mark"><span class="brand-icon">●</span><span class="brand-title">Greenroom</span></div>
          <span class="eyebrow">Snooker pool management</span>
          <h2>${title}</h2><p>${description}</p>
          <form data-form="${view}">
            ${fields}
            <button class="btn btn-block" type="submit">${view === 'login' ? 'Sign in' : isRegister ? 'Create player account' : view === 'forgot' ? 'Send reset code' : 'Update password'}</button>
          </form>
          ${links}
          <p class="field-help">Administrator access is created separately by your system administrator.</p>
        </section>
      </main>
    </div>
  `;
}

function shell(content) {
  const nav = state.user.role === 'admin' ? adminNavigation : userNavigation;
  const section = state.user.role === 'admin' ? 'admin' : 'general';
  const queued = offlineCount();
  return `
    <header class="topbar">
      <div class="topbar-left">
        <div class="brand-mark"><span class="brand-icon">●</span><span class="brand-title">Greenroom</span></div>
        <span class="role-chip">${state.user.role === 'admin' ? 'Facility admin' : 'Player'}</span>
      </div>
      <div class="topbar-right">
        <span class="connection ${navigator.onLine ? '' : 'offline'}">${navigator.onLine ? 'Online' : 'Offline'}${queued ? ` · ${queued} queued` : ''}</span>
        <button class="btn btn-secondary" data-action="logout">Sign out</button>
      </div>
    </header>
    <div class="main-layout">
      <aside class="sidebar">
        <p class="nav-caption">Club menu</p>
        <nav class="nav-list" aria-label="Main navigation">
          ${nav.map(([page, icon, label]) => `
            <a class="nav-link ${state.page === page ? 'active' : ''}" href="/${section}/${page}.html" ${state.page === page ? 'aria-current="page"' : ''}>
              <span class="nav-icon" aria-hidden="true">${icon}</span>${label}
            </a>
          `).join('')}
        </nav>
      </aside>
      <main class="content">
        ${!navigator.onLine ? `<div class="offline-banner">You are offline. New booking requests are saved on this device and will sync when your connection returns.${queued ? ` ${queued} request(s) waiting.` : ''}</div>` : ''}
        ${content}
      </main>
    </div>
  `;
}

function pageHeading(eyebrow, title, description = '') {
  return `<div class="page-heading"><div><span class="eyebrow">${escapeHtml(eyebrow)}</span><h1>${escapeHtml(title)}</h1>${description ? `<p>${escapeHtml(description)}</p>` : ''}</div></div>`;
}

function statCard(label, value) {
  return `<article class="stat-card"><span class="stat-label">${escapeHtml(label)}</span><strong class="stat-value">${escapeHtml(value)}</strong></article>`;
}

function tableCards(tables, showAdminControls = false) {
  if (!tables.length) return emptyState('No tables have been added yet.');
  return `<div class="table-grid">${tables.map((table) => `
    <article class="table-card">
      <div class="table-card-head"><h3>${escapeHtml(table.name)}</h3><span class="small"><i class="status-dot ${escapeHtml(table.liveStatus || table.status)}"></i>${escapeHtml(table.liveStatus || table.status)}</span></div>
      <div class="table-visual" aria-hidden="true"></div>
      <p>${escapeHtml(table.maintenanceNote || `Table ${table.tableNumber} · Ready for a frame.`)}</p>
      ${showAdminControls ? `<button class="btn btn-secondary btn-quiet" data-action="toggle-table" data-id="${table._id}" data-status="${table.status}">${table.status === 'maintenance' ? 'Mark available' : 'Set maintenance'}</button>` : ''}
    </article>
  `).join('')}</div>`;
}

function bookingRows(bookings, admin = false) {
  if (!bookings.length) return emptyState(admin ? 'No booking requests yet.' : 'No bookings to show. Start with an open table.');
  return `<div class="booking-list">${bookings.map((booking) => {
    const tableName = booking.table?.name || 'Table';
    const userName = booking.user?.name ? `<p>Player: ${escapeHtml(booking.user.name)}${booking.user.studentId ? ` · ${escapeHtml(booking.user.studentId)}` : ''}</p>` : '';
    const equipment = booking.equipment?.length
      ? `<p>Equipment: ${booking.equipment.map((item) => `${escapeHtml(item.name)} × ${item.quantity}`).join(', ')}</p>` : '';
    const actions = [];
    if (admin && booking.status === 'pending') {
      actions.push(`<button class="btn btn-quiet" data-action="approve" data-id="${booking._id}">Approve</button>`);
      actions.push(`<button class="btn btn-danger btn-quiet" data-action="reject" data-id="${booking._id}">Reject</button>`);
    }
    if (booking.status === 'pending' && (!admin || booking.user?._id === state.user.id || booking.user === state.user.id)) {
      actions.push(`<button class="btn btn-secondary btn-quiet" data-action="edit-booking" data-id="${booking._id}">Edit</button>`);
      actions.push(`<button class="btn btn-secondary btn-quiet" data-action="cancel-booking" data-id="${booking._id}">Cancel</button>`);
    } else if (!admin && booking.status === 'approved' && new Date(booking.startAt).getTime() > Date.now()) {
      actions.push(`<button class="btn btn-secondary btn-quiet" data-action="cancel-booking" data-id="${booking._id}">Cancel</button>`);
    }
    if (admin && booking.status === 'approved' && booking.paymentStatus === 'unpaid') {
      actions.push(`<button class="btn btn-secondary btn-quiet" data-action="mark-paid" data-id="${booking._id}">Mark paid</button>`);
    }
    
    if (!admin && booking.status === 'approved' && endTime < Date.now()
      && !state.data.reviewedBookingIds?.includes(booking._id)) {
      actions.push(`<button class="btn btn-quiet" data-action="review-booking" data-id="${booking._id}">Leave feedback</button>`);
    }
    return `
      <article class="booking-row">
        <div><h3>${escapeHtml(tableName)}</h3><p>${dateTime(booking.startAt)}</p></div>
        <div>${userName}<p>${booking.durationHours} hour${booking.durationHours === 1 ? '' : 's'} · Payment ${statusPill(booking.paymentStatus)}</p>${equipment}</div>
        <div class="booking-actions">${statusPill(booking.status)}${actions.join('')}</div>
      </article>
    `;
  }).join('')}</div>`;
}

async function renderDashboard() {
  if (state.user.role === 'admin') {
    const [summary, bookings, tables] = await Promise.all([
      api('/api/admin/summary'),
      api('/api/bookings?status=pending'),
      api('/api/tables')
    ]);
    state.data.summary = summary;
    state.data.bookings = bookings.bookings;
    state.data.tables = tables.tables;
    return `
      ${pageHeading('Welcome back', 'The club at a glance', 'Review reservations and keep your tables ready for play.')}
      <div class="stats-grid">
        ${statCard('Pending requests', summary.pendingBookings)}
        ${statCard('Total bookings', summary.totalBookings)}
        ${statCard('Players', summary.users)}
        ${statCard('Upcoming matches', summary.upcomingMatches)}
      </div>
      <div class="split-layout">
        <section><div class="section-heading"><h2>Needs your review</h2><button class="btn btn-secondary btn-quiet" data-page="bookings">All bookings</button></div>${bookingRows(bookings.bookings, true)}</section>
        <section><div class="section-heading"><h2>Table status</h2><button class="btn btn-secondary btn-quiet" data-page="tables">Manage</button></div>${tableCards(tables.tables.slice(0, 3))}</section>
      </div>
    `;
  }
  const [bookings, tables, tournaments, notices] = await Promise.all([
    api('/api/bookings'),
    api('/api/tables'),
    api('/api/tournaments'),
    api('/api/notifications')
  ]);
  state.data.bookings = bookings.bookings;
  state.data.tables = tables.tables;
  state.data.tournaments = tournaments.tournaments;
  state.data.notifications = notices.notifications;
  const upcoming = bookings.bookings.filter((booking) => ['pending', 'approved'].includes(booking.status));
  const nextBooking = upcoming.sort((a, b) => new Date(a.startAt) - new Date(b.startAt))[0];
  const openTables = tables.tables.filter((table) => table.liveStatus === 'available').length;
  const unread = notices.notifications.filter((notice) => !notice.readAt).length;
  return `
    <section class="hero-card">
      <div><span class="eyebrow">Your next frame starts here</span><h2>Book the table.<br>Chalk your cue. Enjoy the game.</h2><p>Check live table status and reserve a time that works for you.</p><button class="btn" data-page="book">Find a table <span aria-hidden="true">→</span></button></div>
      <div class="hero-meta"><strong>${openTables} open</strong>tables ready to play</div>
    </section>
    <div class="stats-grid">
      ${statCard('My active bookings', upcoming.length)}
      ${statCard('Tables available now', openTables)}
      ${statCard('Tournament entries', tournaments.tournaments.filter((item) => item.participants.some((player) => player._id === state.user.id)).length)}
      ${statCard('Unread updates', unread)}
    </div>
    <div class="section-heading"><h2>Next up</h2><button class="btn btn-secondary btn-quiet" data-page="bookings">Booking history</button></div>
    ${nextBooking ? bookingRows([nextBooking]) : emptyState('Nothing booked yet. Pick a table and set up your next game.')}
    <div class="section-heading"><h2>Tables around the club</h2><button class="btn btn-secondary btn-quiet" data-page="book">View availability</button></div>
    ${tableCards(tables.tables)}
  `;
}

function availabilityCards(tables, slotMap = {}) {
  if (!tables.length) return emptyState('No tables are available yet.');
  return `<div class="table-grid">${tables.map((table) => {
    const tableSlots = slotMap[table._id] || [];
    const bookedHours = [...new Set(tableSlots.map((slot) => slot.slice(-5, -3)))].map((hour) => `${hour}:00`);
    const unavailable = table.status === 'maintenance';
    return `
      <article class="table-card">
        <div class="table-card-head"><h3>${escapeHtml(table.name)}</h3><span class="small"><i class="status-dot ${unavailable ? 'maintenance' : 'available'}"></i>${unavailable ? 'maintenance' : 'table'}</span></div>
        <div class="table-visual" aria-hidden="true"></div>
        <p>${unavailable ? escapeHtml(table.maintenanceNote || 'Temporarily unavailable.') : bookedHours.length ? `Reserved hours: ${bookedHours.map(escapeHtml).join(', ')}` : 'No requests for this date yet.'}</p>
      </article>
    `;
  }).join('')}</div>`;
}

async function renderBook() {
  const editId = state.editingBooking || sessionStorage.getItem('snooker-edit-booking');
  const [tablesResponse, equipmentResponse, bookingResponse] = await Promise.all([
    api('/api/tables'),
    api('/api/equipment'),
    editId ? api('/api/bookings') : Promise.resolve({ bookings: [] })
  ]);
  if (editId) state.data.bookings = bookingResponse.bookings;
  state.data.tables = tablesResponse.tables;
  state.data.equipment = equipmentResponse.equipment;
  const bookingId = state.editingBooking || sessionStorage.getItem('snooker-edit-booking');
  const booking = bookingId
    ? (state.data.bookings || []).find((item) => item._id === bookingId) : null;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const date = booking?.dateKey || localDate(tomorrow);
  const selectedTable = booking?.table?._id || booking?.table || '';
  const options = tablesResponse.tables.map((table) => `
    <option value="${table._id}" ${selectedTable === table._id ? 'selected' : ''} ${table.status === 'maintenance' ? 'disabled' : ''}>
      ${escapeHtml(table.name)}${table.status === 'maintenance' ? ' (maintenance)' : ''}
    </option>
  `).join('');
  const equipment = equipmentResponse.equipment.filter((item) => item.status === 'available' && item.quantity > 0);
  return `
    ${pageHeading('Make a reservation', booking ? 'Edit your request' : 'Book a table', 'Choose a table and an on-the-hour start time. Requests are held until an administrator responds.')}
    <div class="split-layout">
      <section class="panel">
        <form data-form="booking" data-id="${booking?._id || ''}">
          <div class="form-grid">
            <div class="field"><label for="tableId">Snooker table</label><select id="tableId" name="tableId" required>${options || '<option value="">No tables available</option>'}</select></div>
            <div class="field"><label for="dateKey">Date</label><input id="dateKey" name="dateKey" type="date" min="${localDate()}" value="${escapeHtml(date)}" required></div>
            <div class="field"><label for="timeKey">Start time</label><input id="timeKey" name="timeKey" type="time" min="08:00" max="20:00" step="3600" value="${escapeHtml(booking?.timeKey || '10:00')}" required><span class="field-help">Bookings start on the hour, between 08:00 and 20:00.</span></div>
            <div class="field"><label for="durationHours">Playing time</label><select id="durationHours" name="durationHours" required>${[1, 2, 3, 4].map((hours) => `<option value="${hours}" ${booking?.durationHours === hours ? 'selected' : ''}>${hours} hour${hours > 1 ? 's' : ''}</option>`).join('')}</select></div>
          </div>
          <div class="field"><label>Equipment request <span class="muted">(optional)</span></label>
            <div class="equipment-options">${equipment.length ? equipment.map((item) => {
              const prior = booking?.equipment?.find((entry) => entry.item === item._id || entry.item?._id === item._id);
              return `<label class="equipment-option"><input type="checkbox" name="equipment-${item._id}" value="${item._id}" ${prior ? 'checked' : ''}>${escapeHtml(item.name)} <span class="muted">(${item.quantity} available)</span><input class="inline-input equipment-quantity" aria-label="${escapeHtml(item.name)} quantity" type="number" min="1" max="${item.quantity}" value="${prior?.quantity || 1}" name="quantity-${item._id}"></label>`;
            }).join('') : '<span class="muted small">No equipment listed.</span>'}</div>
          </div>
          <p class="field-help">Payment is recorded at the club desk. No online payment will be taken by this demo.</p>
          <div class="form-actions"><button class="btn btn-secondary" type="button" data-page="bookings">Back</button><button class="btn" type="submit">${booking ? 'Save changes' : 'Request booking'}</button></div>
        </form>
      </section>
      <section>
        <div class="section-heading"><h2>Live table status</h2></div>
        <div class="panel">${availabilityCards(tablesResponse.tables, state.availability?.slots || {})}</div>
        <div class="panel"><h3 class="panel-title">Before you play</h3><p class="muted small">Pending requests reserve the selected hours so another player cannot double-book them. An admin will approve or decline your request.</p><p class="muted small">When offline, booking requests are queued on this device and checked when your connection returns.</p></div>
      </section>
    </div>
  `;
}

async function renderBookings() {
  const response = await api('/api/bookings');
  state.data.bookings = response.bookings;
  state.data.reviewedBookingIds = response.reviewedBookingIds || [];
  if (state.user.role === 'admin') {
    const pending = response.bookings.filter((booking) => booking.status === 'pending');
    const other = response.bookings.filter((booking) => booking.status !== 'pending');
    return `
      ${pageHeading('Reservations', 'Manage bookings', 'Review requests and keep the booking ledger up to date.')}
      <div class="section-heading"><h2>Awaiting approval <span class="count-pill">${pending.length}</span></h2></div>
      ${bookingRows(pending, true)}
      <div class="section-heading"><h2>Booking history</h2></div>
      ${bookingRows(other, true)}
    `;
  }
  const upcoming = response.bookings.filter((booking) => ['pending', 'approved'].includes(booking.status));
  const history = response.bookings.filter((booking) => !['pending', 'approved'].includes(booking.status));
  return `
    ${pageHeading('Your reservations', 'My bookings', 'See approval updates, manage upcoming time, and review finished sessions.')}
    <div class="section-heading"><h2>Upcoming and pending</h2></div>
    ${bookingRows(upcoming)}
    <div class="section-heading"><h2>History</h2></div>
    ${bookingRows(history)}
  `;
}

function tournamentCards(tournaments, matches, admin) {
  const cards = tournaments.map((tournament) => {
    const isParticipant = tournament.participants.some((player) => player._id === state.user.id);
    const matchList = matches.filter((match) => match.tournament === tournament._id || match.tournament?._id === tournament._id);
    const join = !admin && !isParticipant && tournament.registrationOpen
      ? `<button class="btn btn-quiet" data-action="join-tournament" data-id="${tournament._id}">Join tournament</button>` : '';
    const schedule = admin ? `<button class="btn btn-secondary btn-quiet" data-action="generate-fixtures" data-id="${tournament._id}">Generate round-robin fixtures</button>
      <button class="btn btn-secondary btn-quiet" data-action="toggle-registration" data-id="${tournament._id}" data-open="${tournament.registrationOpen}">${tournament.registrationOpen ? 'Close registration' : 'Open registration'}</button>` : '';
    return `
      <article class="tournament-card panel">
        <div class="tournament-head"><h3>${escapeHtml(tournament.name)}</h3>${statusPill(tournament.registrationOpen ? 'available' : 'completed')}</div>
        <p>${escapeHtml(tournament.description || 'Club tournament')} · ${dateTime(tournament.startDate)}</p>
        <div class="metric-inline"><span class="pill">${tournament.participants.length}/${tournament.playerLimit} players</span><span class="pill">${matchList.length} matches</span></div>
        <p>Players: ${tournament.participants.map((player) => escapeHtml(player.name)).join(', ') || 'No registrations yet.'}</p>
        <div class="form-actions">${join}${schedule}</div>
        ${matchList.length ? `<div class="section-heading"><h2>Fixtures</h2></div>${matchList.map((match) => matchCard(match, admin)).join('')}` : ''}
      </article>
    `;
  });
  return cards.length ? `<div class="grid-two">${cards.join('')}</div>` : emptyState('No tournaments have been announced yet.');
}

function matchCard(match, admin) {
  const first = match.playerOne?.name || 'Player 1';
  const second = match.playerTwo?.name || 'Player 2';
  if (!admin) {
    return `<article class="match-card"><div class="match-players">${escapeHtml(first)} vs ${escapeHtml(second)}</div><p class="muted small">${dateTime(match.scheduledAt)} · ${match.table?.name ? escapeHtml(match.table.name) : 'Table to be assigned'} · ${match.status === 'completed' ? `${match.scoreOne} – ${match.scoreTwo}` : 'Scheduled'}</p>${match.winner ? `<span class="pill">Winner: ${escapeHtml(match.winner.name)}</span>` : ''}</article>`;
  }
  const tables = state.data.tables || [];
  return `
    <article class="match-card">
      <div class="match-players">${escapeHtml(first)} vs ${escapeHtml(second)}</div>
      <p class="muted small">${dateTime(match.scheduledAt)} · ${match.table?.name ? escapeHtml(match.table.name) : 'No table assigned'} · ${match.status}</p>
      ${match.status === 'completed' ? `<span class="pill">${match.scoreOne} – ${match.scoreTwo} · Winner: ${escapeHtml(match.winner?.name || '')}</span>` : `
        <form class="match-score-form" data-form="match-schedule" data-id="${match._id}">
          <input class="inline-input" type="datetime-local" name="scheduledAt" value="${escapeHtml(localDateTimeValue(match.scheduledAt))}" aria-label="Match date and time" required>
          <select class="inline-input" name="tableId" aria-label="Match table" required>${tables.map((table) => `<option value="${table._id}" ${match.table?._id === table._id ? 'selected' : ''}>${escapeHtml(table.name)}</option>`).join('')}</select>
          <button class="btn btn-secondary" type="submit">Set schedule</button>
        </form>
        <form class="match-score-form" data-form="match-result" data-id="${match._id}">
          <input class="inline-input" type="number" min="0" name="scoreOne" aria-label="${escapeHtml(first)} score" placeholder="${escapeHtml(first)} score" required>
          <input class="inline-input" type="number" min="0" name="scoreTwo" aria-label="${escapeHtml(second)} score" placeholder="${escapeHtml(second)} score" required>
          <button class="btn" type="submit">Verify result</button>
        </form>
      `}
    </article>
  `;
}

async function renderTournaments() {
  const result = await api('/api/tournaments');
  state.data.tournaments = result.tournaments;
  state.data.matches = result.matches;
  if (state.user.role === 'admin') {
    const tables = await api('/api/tables');
    state.data.tables = tables.tables;
    return `
      ${pageHeading('Club competition', 'Tournaments & matches', 'Open registration, create fixtures, schedule tables, and verify match results.')}
      <div class="split-layout">
        <section class="panel">
          <h2 class="panel-title">Create a tournament</h2>
          <form data-form="tournament-create">
            <div class="field"><label for="tournamentName">Tournament name</label><input id="tournamentName" name="name" required minlength="2" maxlength="120"></div>
            <div class="field"><label for="tournamentDescription">Description</label><textarea id="tournamentDescription" name="description" maxlength="1000"></textarea></div>
            <div class="form-grid">
              <div class="field"><label for="startDate">Start date</label><input id="startDate" name="startDate" type="date" required></div>
              <div class="field"><label for="playerLimit">Player limit</label><input id="playerLimit" name="playerLimit" type="number" min="2" max="128" value="16" required></div>
            </div>
            <button class="btn" type="submit">Create tournament</button>
          </form>
        </section>
        <section>          ${tournamentCards(result.tournaments, result.matches, true)}</section>
      </div>
    `;
  }
  return `
    ${pageHeading('Club competition', 'Tournaments', 'Join a tournament, follow the fixtures, and keep track of results.')}
    ${tournamentCards(result.tournaments, result.matches, false)}
  `;
}

async function renderTables() {
  const response = await api('/api/tables');
  state.data.tables = response.tables;
  return `
    ${pageHeading('Facility', 'Table management', 'See the live status board and set tables aside for maintenance.')}
    <section class="panel">
      <h2 class="panel-title">Add a table</h2>
      <form class="form-grid" data-form="table-add">
        <div class="field"><label for="tableNumber">Table number</label><input id="tableNumber" name="tableNumber" type="number" min="1" required></div>
        <div class="field"><label for="tableName">Display name</label><input id="tableName" name="name" placeholder="Table 5" required minlength="2" maxlength="80"></div>
        <div class="form-actions"><button class="btn" type="submit">Add table</button></div>
      </form>
    </section>
    <div class="section-heading"><h2>Table status board</h2></div>
    ${tableCards(response.tables, true)}
  `;
}

async function renderEquipment() {
  const result = await api('/api/equipment');
  state.data.equipment = result.equipment;
  return `
    ${pageHeading('Facility', 'Equipment inventory', 'Keep track of cues, ball sets, and the equipment requested with bookings.')}
    <section class="panel">
      <h2 class="panel-title">Add equipment</h2>
      <form class="form-grid" data-form="equipment-add">
        <div class="field"><label for="equipmentName">Item name</label><input id="equipmentName" name="name" required minlength="2" maxlength="100"></div>
        <div class="field"><label for="equipmentQuantity">Quantity</label><input id="equipmentQuantity" name="quantity" type="number" min="0" value="1" required></div>
        <div class="field full"><label for="equipmentNote">Notes</label><input id="equipmentNote" name="note" maxlength="300"></div>
        <div class="form-actions"><button class="btn" type="submit">Add item</button></div>
      </form>
    </section>
    <div class="section-heading"><h2>Inventory</h2></div>
    ${result.equipment.length ? `<div class="table-wrap panel"><table><thead><tr><th>Item</th><th>Quantity</th><th>Status</th><th>Update quantity</th></tr></thead><tbody>${result.equipment.map((item) => `
      <tr><td><strong>${escapeHtml(item.name)}</strong><div class="muted small">${escapeHtml(item.note || '')}</div></td><td>${item.quantity}</td><td>${statusPill(item.status)}</td><td><form class="inventory-update-form" data-form="equipment-update" data-id="${item._id}"><input class="inline-input inventory-quantity" type="number" name="quantity" min="0" value="${item.quantity}" aria-label="Quantity for ${escapeHtml(item.name)}"><button class="btn btn-secondary btn-quiet" type="submit">Save</button><button class="btn btn-secondary btn-quiet" type="button" data-action="toggle-equipment" data-id="${item._id}" data-status="${item.status}">${item.status === 'maintenance' ? 'Available' : 'Maintenance'}</button></form></td></tr>
    `).join('')}</tbody></table></div>` : emptyState('No equipment has been added yet.')}
  `;
}

async function renderProfile() {
  return `
    ${pageHeading('Your account', 'My profile', 'Keep your contact details up to date for booking notifications.')}
    <section class="panel profile-panel">
      <form data-form="profile">
        <div class="field"><label for="name">Full name</label><input id="name" name="name" required minlength="2" maxlength="100" value="${escapeHtml(state.user.name)}"></div>
        <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" required value="${escapeHtml(state.user.email)}"></div>
        <div class="field"><label for="phone">Phone</label><input id="phone" name="phone" type="tel" maxlength="30" value="${escapeHtml(state.user.phone)}"></div>
        <div class="field"><label for="studentId">Student or staff ID</label><input id="studentId" name="studentId" maxlength="50" value="${escapeHtml(state.user.studentId)}"></div>
        <p class="field-help">Account type: ${escapeHtml(state.user.role)}. Contact an administrator if this is incorrect.</p>
        <div class="form-actions"><button class="btn" type="submit">Save profile</button></div>
      </form>
    </section>
  `;
}

async function renderNotifications() {
  const result = await api('/api/notifications');
  state.data.notifications = result.notifications;
  return `
    ${pageHeading('Your updates', 'Notifications', 'Booking decisions and payment updates appear here.')}
    <div class="form-actions notification-actions"><button class="btn btn-secondary" data-action="read-notifications">Mark all as read</button></div>
    ${result.notifications.length ? `<div class="notification-list">${result.notifications.map((notice) => `<article class="notification-item ${notice.readAt ? '' : 'unread'}"><strong>${dateTime(notice.createdAt)}</strong><div>${escapeHtml(notice.message)}</div></article>`).join('')}</div>` : emptyState('No updates just yet.')}
  `;
}
async function renderFeedback() {
  if (state.user.role === 'admin') {
    const result = await api('/api/admin/feedback');
    return `
      ${pageHeading('Player feedback', 'Ratings & feedback', 'Use player reviews to identify equipment that needs attention.')}
      ${result.feedback.length ? `<div class="booking-list">${result.feedback.map((item) => `
        <article class="panel"><div class="booking-head"><strong>${escapeHtml(item.user?.name || 'Player')} · ${escapeHtml(item.table?.name || 'Table')}</strong><span>${'★'.repeat(item.rating)}${'☆'.repeat(5 - item.rating)}</span></div><p class="muted">${escapeHtml(item.comment || 'No comment provided.')}</p><span class="field-help">${dateTime(item.createdAt)}</span></article>
      `).join('')}</div>` : emptyState('No player feedback has been submitted yet.')}
    `;
  }
  const result = await api('/api/bookings?status=approved');
  const reviewed = new Set(result.reviewedBookingIds || []);
  const eligible = result.bookings.filter((booking) => !reviewed.has(booking._id));
  const options = eligible.map((booking) => `
    <option value="${booking._id}">${escapeHtml(booking.table?.name || 'Table')} · ${escapeHtml(dateTime(booking.startAt))}</option>
  `).join('');
  return `
    ${pageHeading('Share your experience', 'Player feedback', 'Rate your table and equipment after an approved booking.')}
    <section class="panel profile-panel">
      ${eligible.length ? `
        <form data-form="feedback">
          <div class="field">
            <label for="bookingId">Approved booking</label>
            <select id="bookingId" name="bookingId" required>${options}</select>
          </div>
          <div class="field">
            <label for="rating">Rating</label>
            <select id="rating" name="rating" required>
              <option value="5">★★★★★ (5 - Excellent)</option>
              <option value="4">★★★★☆ (4 - Good)</option>
              <option value="3">★★★☆☆ (3 - Average)</option>
              <option value="2">★★☆☆☆ (2 - Needs attention)</option>
              <option value="1">★☆☆☆☆ (1 - Poor)</option>
            </select>
          </div>
          <div class="field">
            <label for="comment">Feedback</label>
            <textarea id="comment" name="comment" maxlength="1000" placeholder="Share any notes about the table cloth, cues, or your session..." required></textarea>
          </div>
          <div class="form-actions"><button class="btn" type="submit">Submit feedback</button></div>
        </form>
      ` : emptyState('No approved bookings waiting for feedback. Book a table and have an admin approve it first.')}
    </section>
  `;
}

async function renderReports() {
  const [report, tables] = await Promise.all([api('/api/admin/reports'), api('/api/tables')]);
  state.data.tables = tables.tables;
  const statusLabels = report.statuses.map((item) => `<span class="pill">${escapeHtml(item._id)}: ${item.count}</span>`).join('');
  return `
    ${pageHeading('Club activity', 'Usage reports', 'A quick view of reservations, table usage, and player ratings.')}
    <div class="stats-grid">
      ${statCard('Average rating', Number(report.rating.average || 0).toFixed(1))}
      ${statCard('Feedback received', report.rating.count)}
      ${statCard('Tables in service', tables.tables.filter((table) => table.status === 'available').length)}
      ${statCard('Recorded booking states', report.statuses.reduce((sum, item) => sum + item.count, 0))}
    </div>
    <section class="panel"><h2 class="panel-title">Booking status breakdown</h2><div class="metric-inline">${statusLabels || 'No bookings yet.'}</div></section>
    <div class="grid-two">
      <section class="panel"><h2 class="panel-title">Most-used tables</h2>${report.tableUsage.length ? `<div class="table-wrap"><table><thead><tr><th>Table</th><th>Bookings</th><th>Hours played</th></tr></thead><tbody>${report.tableUsage.map((item) => `<tr><td>${escapeHtml(item.table?.name || 'Table')}</td><td>${item.count}</td><td>${item.hours}</td></tr>`).join('')}</tbody></table></div>` : emptyState('Approved bookings will appear here.')}</section>
      <section class="panel"><h2 class="panel-title">Recent bookings</h2>${bookingRows(report.recentBookings, true)}</section>
    </div>
  `;
}

async function renderPage() {
  if (!state.user) {
    if (!['login', 'register', 'forgot', 'reset'].includes(currentPage)) {
      window.location.replace('/public/login.html');
      return;
    }
    app.innerHTML = authPage();
    return;
  }
  if (['login', 'register', 'forgot', 'reset'].includes(currentPage)) {
    window.location.replace(state.user.role === 'admin' ? '/admin/dashboard.html' : '/general/dashboard.html');
    return;
  }
  if (document.body.dataset.role === 'admin' && state.user.role !== 'admin') {
    window.location.replace('/general/dashboard.html');
    return;
  }
  if (document.body.dataset.role === 'user' && state.user.role === 'admin') {
    window.location.replace('/admin/dashboard.html');
    return;
  }
  app.innerHTML = shell('<div class="loading-screen">Loading club details...</div>');
  try {
    const renderers = {
      dashboard: renderDashboard,
      book: renderBook,
      bookings: renderBookings,
      tables: renderTables,
      equipment: renderEquipment,
      tournaments: renderTournaments,
      profile: renderProfile,
      notifications: renderNotifications,
      feedback: renderFeedback,
      reports: renderReports
    };
    const content = await renderers[state.page]();
    app.innerHTML = shell(content);
    if (state.page === 'book') await loadAvailability();
  } catch (error) {
    app.innerHTML = shell(`${pageHeading('Something went wrong', 'Could not load this page')}${emptyState(error.message)}`);
  }
}

async function loadAvailability() {
  const dateInput = document.querySelector('[name="dateKey"]');
  if (!dateInput?.value) return;
  try {
    state.availability = await api(`/api/tables/availability?date=${encodeURIComponent(dateInput.value)}`);
    const tableSection = document.querySelector('.split-layout > section:last-child .panel');
    if (tableSection) tableSection.innerHTML = availabilityCards(state.data.tables || [], state.availability.slots || {});
  } catch (error) {
    showToast(error.message, true);
  }
}

async function refreshPage() {
  await renderPage();
}

function readOfflineQueue() {
  const raw = localStorage.getItem('snooker-offline-bookings');
  if (!raw) return [];
  const queue = JSON.parse(raw);
  return Array.isArray(queue) ? queue : [];
}

function writeOfflineQueue(queue) {
  localStorage.setItem('snooker-offline-bookings', JSON.stringify(queue));
}

async function syncOfflineBookings() {
  if (!state.user || !navigator.onLine) return;
  const queue = readOfflineQueue();
  const remaining = [];
  let synced = 0;
  let failed = 0;
  for (const item of queue) {
    if (item.userId !== state.user.id) {
      remaining.push(item);
      continue;
    }
    try {
      await api('/api/bookings', { method: 'POST', body: JSON.stringify(item.booking) });
      synced += 1;
    } catch (error) {
      if (error.status === 409 || error.status === 400) {
        failed += 1;
      } else {
        remaining.push(item);
      }
    }
  }
  writeOfflineQueue(remaining);
  if (synced || failed) {
    showToast(`${synced} offline booking(s) synced${failed ? `; ${failed} need a new time` : ''}.`, failed > 0);
    await renderPage();
  }
}

app.addEventListener('click', async (event) => {
  const pageButton = event.target.closest('button[data-page]');
  if (pageButton) {
    const destination = pageButton.dataset.page;
    const section = state.user?.role === 'admin' ? 'admin' : 'general';
    window.location.assign(`/${section}/${destination}.html`);
    return;
  }
  const actionButton = event.target.closest('[data-action]');
  if (!actionButton) return;
  const { action, id } = actionButton.dataset;
  try {
    if (action === 'auth-view') {
      window.location.assign(`/public/${actionButton.dataset.view}.html`);
      return;
    }
    if (action === 'logout') {
      await api('/api/auth/logout', { method: 'POST' });
      state.user = null;
      window.location.assign('/public/login.html');
      return;
    }
    if (action === 'approve' || action === 'reject') {
      await api(`/api/admin/bookings/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: action === 'approve' ? 'approved' : 'rejected' })
      });
      showToast(`Booking ${action === 'approve' ? 'approved' : 'rejected'}.`);
    } else if (action === 'mark-paid') {
      await api(`/api/admin/bookings/${id}`, { method: 'PATCH', body: JSON.stringify({ paymentStatus: 'paid' }) });
      showToast('Payment marked as received.');
    } else if (action === 'cancel-booking') {
      if (!window.confirm('Cancel this booking?')) return;
      await api(`/api/bookings/${id}`, { method: 'DELETE' });
      showToast('Booking cancelled.');
    } else if (action === 'edit-booking') {
      sessionStorage.setItem('snooker-edit-booking', id);
      window.location.assign('/general/book.html');
    } else if (action === 'toggle-table') {
      const status = actionButton.dataset.status === 'maintenance' ? 'available' : 'maintenance';
      const maintenanceNote = status === 'maintenance' ? window.prompt('Optional maintenance note:') || '' : '';
      await api(`/api/admin/tables/${id}`, { method: 'PATCH', body: JSON.stringify({ status, maintenanceNote }) });
      showToast(`Table marked ${status}.`);
    } else if (action === 'toggle-equipment') {
      const status = actionButton.dataset.status === 'maintenance' ? 'available' : 'maintenance';
      await api(`/api/admin/equipment/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      showToast(`Equipment marked ${status}.`);
    } else if (action === 'join-tournament') {
      await api(`/api/tournaments/${id}/join`, { method: 'POST', body: '{}' });
      showToast('You are registered for the tournament.');
    } else if (action === 'generate-fixtures') {
      await api(`/api/admin/tournaments/${id}/schedule`, { method: 'POST', body: '{}' });
      showToast('Round-robin fixtures generated.');
    } else if (action === 'toggle-registration') {
      await api(`/api/admin/tournaments/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ registrationOpen: actionButton.dataset.open !== 'true' })
      });
      showToast('Tournament registration updated.');
    } else if (action === 'review-booking') {
      const rating = window.prompt('Rate your session from 1 to 5:');
      if (rating === null) return;
      const comment = window.prompt('Optional feedback about the table or equipment:') || '';
      await api('/api/feedback', {
        method: 'POST',
        body: JSON.stringify({ bookingId: id, rating: Number(rating), comment })
      });
      showToast('Thanks for sharing your feedback.');
    } else if (action === 'read-notifications') {
      await api('/api/notifications/read', { method: 'PATCH', body: '{}' });
      showToast('Notifications marked as read.');
    }
    if (state.page !== currentPage) {
      const section = state.user?.role === 'admin' ? 'admin' : 'general';
      window.location.assign(`/${section}/${state.page}.html`);
    } else {
      await refreshPage();
    }
  } catch (error) {
    showToast(error.message, true);
  }
});

app.addEventListener('change', async (event) => {
  if (event.target.name === 'dateKey' && state.page === 'book') await loadAvailability();
});

app.addEventListener('submit', async (event) => {
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();
  const action = form.dataset.form;
  const values = formData(form);
  const submitButton = form.querySelector('[type="submit"]');
  if (submitButton) submitButton.disabled = true;
  try {
    if (action === 'login') {
      const result = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(values) });
      state.user = result.user;
      state.page = 'dashboard';
      showToast(`Welcome back, ${result.user.name}.`);
      await syncOfflineBookings();
    } else if (action === 'register') {
      const result = await api('/api/auth/register', { method: 'POST', body: JSON.stringify(values) });
      state.user = result.user;
      state.page = 'dashboard';
      showToast('Your player account is ready.');
    } else if (action === 'forgot') {
      await api('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify(values) });
      sessionStorage.setItem('snooker-reset-email', values.email);
      window.location.assign('/public/reset-password.html');
      return;
    } else if (action === 'reset') {
      await api('/api/auth/reset-password', { method: 'POST', body: JSON.stringify(values) });
      sessionStorage.removeItem('snooker-reset-email');
      window.location.assign('/public/login.html');
      return;
    } else if (action === 'booking') {
      const equipment = Object.entries(values)
        .filter(([key]) => key.startsWith('equipment-'))
        .map(([key]) => {
          const id = key.slice('equipment-'.length);
          return { id, quantity: Number(values[`quantity-${id}`] || 1) };
        });
      const booking = {
        tableId: values.tableId,
        dateKey: values.dateKey,
        timeKey: values.timeKey,
        durationHours: Number(values.durationHours),
        startAt: new Date(`${values.dateKey}T${values.timeKey}:00+06:00`).toISOString(),
        timezoneOffsetMinutes: clubUtcOffsetMinutes,
        equipment
      };
      if (!navigator.onLine) {
        const queue = readOfflineQueue();
        queue.push({ userId: state.user.id, booking, createdAt: new Date().toISOString() });
        writeOfflineQueue(queue);
        state.page = 'bookings';
        showToast('Booking saved on this device. It will sync when you are online.');
      } else {
        const id = form.dataset.id || sessionStorage.getItem('snooker-edit-booking');
        if (id) {
          await api(`/api/bookings/${id}`, { method: 'PATCH', body: JSON.stringify(booking) });
          sessionStorage.removeItem('snooker-edit-booking');
          showToast('Booking request updated.');
        } else {
          await api('/api/bookings', { method: 'POST', body: JSON.stringify(booking) });
          showToast('Booking request sent for approval.');
        }
        state.page = 'bookings';
      }
      } else if (action === 'feedback') {
      await api('/api/feedback', {
        method: 'POST',
        body: JSON.stringify({
          bookingId: values.bookingId,
          rating: Number(values.rating),
          comment: values.comment
        })
      });
      showToast('Thanks for sharing your feedback.');
    } else if (action === 'profile') {
      const result = await api('/api/me', { method: 'PATCH', body: JSON.stringify(values) });
      state.user = result.user;
      showToast('Profile saved.');
    } else if (action === 'table-add') {
      await api('/api/admin/tables', { method: 'POST', body: JSON.stringify(values) });
      showToast('Table added.');
    } else if (action === 'equipment-add') {
      await api('/api/admin/equipment', { method: 'POST', body: JSON.stringify(values) });
      showToast('Equipment added.');
    } else if (action === 'equipment-update') {
      await api(`/api/admin/equipment/${form.dataset.id}`, { method: 'PATCH', body: JSON.stringify(values) });
      showToast('Equipment quantity updated.');
    } else if (action === 'tournament-create') {
      await api('/api/admin/tournaments', { method: 'POST', body: JSON.stringify(values) });
      showToast('Tournament created.');
    } else if (action === 'match-schedule') {
      const scheduledDate = values.scheduledAt.slice(0, 10);
      const scheduledTime = `${values.scheduledAt.slice(11, 13)}:00`;
      if (values.scheduledAt.slice(14, 16) !== '00') throw new Error('Tournament matches must start on the hour.');
      await api(`/api/admin/matches/${form.dataset.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          scheduledAt: new Date(`${scheduledDate}T${scheduledTime}:00+06:00`).toISOString(),
          dateKey: scheduledDate,
          timeKey: scheduledTime,
          timezoneOffsetMinutes: clubUtcOffsetMinutes,
          tableId: values.tableId
        })
      });
      showToast('Match schedule updated.');
    } else if (action === 'match-result') {
      await api(`/api/admin/matches/${form.dataset.id}`, { method: 'PATCH', body: JSON.stringify(values) });
      showToast('Match result verified.');
    }
    if (state.page !== currentPage) {
      const section = state.user?.role === 'admin' ? 'admin' : 'general';
      window.location.assign(`/${section}/${state.page}.html`);
    } else {
      await refreshPage();
    }
  } catch (error) {
    showToast(error.message, true);
    if (error.status === 401 && state.user) {
      state.user = null;
      state.authView = 'login';
      app.innerHTML = authPage();
    }
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

window.addEventListener('online', async () => {
  document.querySelector('.connection')?.classList.remove('offline');
  if (state.user) await syncOfflineBookings();
  else await renderPage();
});

window.addEventListener('offline', () => {
  document.querySelector('.connection')?.classList.add('offline');
  if (state.user) renderPage();
});

async function boot() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch((error) => console.error('Offline shell could not be installed:', error));
  }
  try {
    const result = await api('/api/me');
    state.user = result.user;
    await syncOfflineBookings();
  } catch (error) {
    if (error.status !== 401) {
      app.innerHTML = `${authPage()}<div class="connection-error" role="alert">Cannot connect to the Snooker Booking API: ${escapeHtml(error.message)}. Check the server and database connection, then refresh.</div>`;
      return;
    }
    state.user = null;
  }
  await renderPage();
}

boot();
