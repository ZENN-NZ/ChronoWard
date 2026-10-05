// ============================
// ChronoWard — utils.js
// Pure utility functions
// ============================

export function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

export function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizeCsvCell(val) {
  let str = String(val ?? '').replace(/"/g, '""');
  const trimmed = str.trimStart();
  if (/^[=+\-@\t\r]/.test(trimmed)) {
    str = "'" + str;
  }
  return `"${str}"`;
}

export function parseTicketNum(val) {
  const str = String(val ?? '').trim();
  if (!str) return { prefix: '', id: '', isValid: true };
  const match = str.match(/^(.*?)(\d*)$/);
  if (!match) return { prefix: str, id: '', isValid: str.length <= 12 };
  const prefix = match[1];
  const id = match[2];
  const isValid = prefix.length <= 12 && id.length <= 12;
  return { prefix, id, isValid };
}

export function getTodayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getWeekMonday(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay(); // 0=Sun, 1=Mon, ...
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return formatDate(d);
}

export function dayAbbr(dateStr) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[new Date(dateStr + 'T12:00:00').getDay()];
}

export function getWeekdayDates(dateStr) {
  const monday = new Date(getWeekMonday(dateStr) + 'T12:00:00');
  const dates = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    dates.push(formatDate(d));
  }
  return dates;
}

export function validateHudPayload(payload) {
  if (!payload || !payload.date || !payload.row || typeof payload.date !== 'string') {
    return { isValid: false, error: 'Invalid payload' };
  }
  
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) {
    return { isValid: false, error: 'Invalid date format' };
  }

  let hours = parseFloat(payload.row.hours) || 0;
  hours = Math.max(0, Math.min(24, hours));

  const safeRow = {
    timerId: typeof payload.row.timerId === 'string' ? payload.row.timerId : generateId(),
    task: String(payload.row.task || ''),
    hours: hours,
    ot: Boolean(payload.row.ot),
    ticketNum: String(payload.row.ticketNum || ''),
    description: String(payload.row.description || '')
  };

  return { isValid: true, safeRow };
}
