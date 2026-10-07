// Date helpers. Bookings are stored as local "YYYY-MM-DD HH:MM" strings (business time).
export const pad = (n) => String(n).padStart(2, '0');

export const toYMD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromYMD = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const todayYMD = () => toYMD(new Date());

export const addDays = (ymd, n) => { const d = fromYMD(ymd); d.setDate(d.getDate() + n); return toYMD(d); };
export const addMonths = (ymd, n) => { const d = fromYMD(ymd); d.setDate(1); d.setMonth(d.getMonth() + n); return toYMD(d); };

// Week starts on Sunday like Picktime's layout
export const startOfWeek = (ymd) => { const d = fromYMD(ymd); d.setDate(d.getDate() - d.getDay()); return toYMD(d); };
export const startOfMonth = (ymd) => ymd.slice(0, 8) + '01';
export const daysInMonth = (ymd) => { const d = fromYMD(ymd); return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); };
export const dayOfWeek = (ymd) => fromYMD(ymd).getDay();

export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

// "HH:MM" <-> minutes
export const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
export const fromMin = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

export const datePart = (dt) => dt.slice(0, 10);
export const timePart = (dt) => dt.slice(11, 16);
export const minutesBetween = (a, b) => {
  const da = fromYMD(datePart(a)), db = fromYMD(datePart(b));
  return Math.round((db - da) / 60000) + toMin(timePart(b)) - toMin(timePart(a));
};
export const addMinutesDT = (dt, mins) => {
  const d = fromYMD(datePart(dt));
  d.setMinutes(toMin(timePart(dt)) + mins);
  return `${toYMD(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// Picktime-style compact times: "11a", "12:30p"
export const shortTime = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? ':' + pad(m) : ''}${h < 12 ? 'a' : 'p'}`;
};
// "11:00 am"
export const longTime = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)} ${h < 12 ? 'am' : 'pm'}`;
};
// "11am", "11:30am" for grid labels
export const gridLabel = (min) => {
  const h = Math.floor(min / 60), m = min % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? ':' + pad(m) : ''}${h < 12 ? 'am' : 'pm'}`;
};

export const prettyDate = (ymd) => {
  const d = fromYMD(ymd);
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}, ${DAY_LONG[d.getDay()]} ${d.getFullYear()}`;
};
export const prettyShortDate = (ymd) => {
  const d = fromYMD(ymd);
  return `${MONTH_SHORT[d.getMonth()]} ${ordinal(d.getDate())}, ${d.getFullYear()}`;
};
// When a booking was made: stored in UTC ("YYYY-MM-DD HH:MM:SS"), shown in local time as "07/10/2026 15:14"
export const bookedOn = (utc) => {
  if (!utc) return '';
  const d = new Date(utc.replace(' ', 'T') + 'Z');
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const durationLabel = (mins) => {
  const h = Math.floor(mins / 60), m = mins % 60;
  return [h ? `${h}hr` : '', m ? `${m}min` : ''].filter(Boolean).join(' ') || '0min';
};
