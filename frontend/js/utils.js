(function () {
  const clubTimeZone = 'Asia/Thimphu';

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
  }

  function localDateTimeValue(iso) {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: clubTimeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
  }

  function localDate(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: clubTimeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  function dateTime(iso) {
    if (!iso) return 'To be scheduled';
    const parsed = new Date(iso);
    return Number.isNaN(parsed.getTime()) ? 'To be scheduled' : parsed.toLocaleString([], {
      dateStyle: 'medium', timeStyle: 'short', timeZone: clubTimeZone
    });
  }

  function statusPill(status) {
    return `<span class="status-pill ${escapeHtml(status)}">${escapeHtml(status)}</span>`;
  }

  function emptyState(message) {
    return `<div class="empty-state">${escapeHtml(message)}</div>`;
  }

  window.SnookerUtils = { escapeHtml, localDateTimeValue, localDate, dateTime, statusPill, emptyState };
})();
