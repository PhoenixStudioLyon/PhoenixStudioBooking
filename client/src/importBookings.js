// Turning a Picktime bookings export (.xlsx or .csv) into bookings for /api/bookings/import
import { addMinutesDT } from './dates.js';
import { instagramFromName, parseCsv } from './importCustomers.js';
import { readXlsx } from './xlsx.js';

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n) => String(n).padStart(2, '0');
const clean = (v) => { const s = String(v ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim(); return s === '-' ? '' : s; };

// "Jun 12 2026, 3:30 PM" -> "2026-06-12 15:30"
export function parsePicktimeDate(s) {
  const m = clean(s).match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4}),?\s+(\d{1,2}):(\d{2})\s*([AP]M)?$/i);
  if (!m || !MONTHS[m[1].toLowerCase()]) return null;
  let h = Number(m[4]);
  if (m[6]) { const pm = m[6].toUpperCase() === 'PM'; if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12; }
  return `${m[3]}-${pad(MONTHS[m[1].toLowerCase()])}-${pad(m[2])} ${pad(h)}:${m[5]}`;
}

// "1hr 30mins" / "6hrs 05mins" / "45mins" -> minutes
export function parseDuration(s) {
  const t = clean(s).toLowerCase();
  const h = t.match(/(\d+)\s*h/), m = t.match(/(\d+)\s*m/);
  return (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
}

const STATUS = { confirmed: 'confirmed', pending: 'pending', completed: 'completed', 'no-show': 'no_show', 'no show': 'no_show', cancelled: 'cancelled', canceled: 'cancelled' };

// Calendar entries that aren't clients (conventions, guests, appointments of the staff…) become time blockers
export const BLOCKER_PATTERNS = [
  /^niko guest$/i, /^kun guest$/i, /convention/i, /^rdv dent/i, /^electricity cut$/i, /^bank$/i,
  /^manu$/i, /^quang( tattoo)?$/i, /^tattoo with niko$/i,
];
export const looksLikeBlocker = (name) => BLOCKER_PATTERNS.some((re) => re.test(clean(name)));

export async function bookingsFromFile(file) {
  const rows = /\.xlsx$/i.test(file.name) ? await readXlsx(file) : parseCsv(await file.text());
  const h = rows.findIndex((r) => r.some((c) => /team member/i.test(c)) && r.some((c) => /^date$/i.test(clean(c))));
  if (h < 0) throw new Error('This doesn\'t look like a Picktime bookings export (no "Team Member" / "Date" columns)');
  const col = {};
  rows[h].forEach((c, i) => { col[clean(c).toLowerCase()] = i; });
  const get = (r, name) => clean(r[col[name]]);

  const bookings = [], problems = [];
  for (const r of rows.slice(h + 1)) {
    if (!get(r, 'date') && !get(r, 'team member')) continue; // footer ("Powered by Picktime") or empty line
    const start = parsePicktimeDate(get(r, 'date'));
    const minutes = parseDuration(get(r, 'duration'));
    if (!start || !minutes) { problems.push(`#${get(r, 's.no') || '?'}: date "${get(r, 'date')}" / duration "${get(r, 'duration')}"`); continue; }
    const name = get(r, 'customer name');
    bookings.push({
      no: get(r, 's.no'),
      artist: get(r, 'team member'),
      service: get(r, 'service type'),
      start,
      end: addMinutesDT(start, minutes),
      notes: get(r, 'booking notes'),
      status: STATUS[get(r, 'status').toLowerCase()] || 'confirmed',
      name,
      customer: { name, phone: get(r, 'mobile number'), email: get(r, 'email'), instagram: instagramFromName(name) },
    });
  }
  return { bookings, problems };
}
