// SQLite database (built into Node >= 22.13, no install needed)
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || resolve(__dirname, '../data/phoenix.db');
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  address TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS team_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#C8643F',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  role TEXT DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  duration_min INTEGER NOT NULL DEFAULT 60,
  price REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  alt_phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  gender TEXT DEFAULT '',
  birthday TEXT DEFAULT '',
  address TEXT DEFAULT '',
  city TEXT DEFAULT '',
  postcode TEXT DEFAULT '',
  country TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (date('now'))
);
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'appointment' CHECK (type IN ('appointment','blocker')),
  title TEXT DEFAULT '',
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  service_id INTEGER REFERENCES services(id) ON DELETE SET NULL,
  team_member_id INTEGER REFERENCES team_members(id) ON DELETE SET NULL,
  start TEXT NOT NULL,           -- 'YYYY-MM-DD HH:MM' in business local time
  end TEXT NOT NULL,
  price REAL NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed','pending','completed','no_show','cancelled')),
  series_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bookings_start ON bookings(start);
CREATE INDEX IF NOT EXISTS idx_bookings_customer ON bookings(customer_id);
CREATE TABLE IF NOT EXISTS booking_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  name TEXT DEFAULT '',
  mime TEXT NOT NULL,
  data BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_booking_photos_booking ON booking_photos(booking_id);
-- Reports: one row per calendar change. Text is stored ready to read, so it survives deleted bookings/people.
CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (datetime('now')),  -- UTC
  user_id INTEGER,
  user_name TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,                       -- created | moved | status | edited | deleted | photo_added | photo_removed
  booking_id INTEGER,
  booking_ref TEXT DEFAULT '',
  booking_type TEXT DEFAULT 'appointment',
  subject TEXT DEFAULT '',                    -- customer name or time-blocker title
  team_member_name TEXT DEFAULT '',
  changes TEXT NOT NULL DEFAULT '[]'          -- JSON [{ label, from, to }]
);
CREATE INDEX IF NOT EXISTS idx_activity_at ON activity_log(at);
CREATE INDEX IF NOT EXISTS idx_activity_booking ON activity_log(booking_id, action);
-- Artist notes: added after booking, each signed by its author (the booking's own note stays as written)
CREATE TABLE IF NOT EXISTS booking_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  user_id INTEGER,
  user_name TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_booking_notes_booking ON booking_notes(booking_id);
`);

// ---------- migrations for databases created by older versions
function addColumn(table, col, def) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}
// Roles: an admin manages everything; a tattoo artist manages only their own calendar column
// (team_member_id) and sees clients with masked names and no contact details. A login can be both.
addColumn('users', 'is_admin', 'INTEGER NOT NULL DEFAULT 1'); // existing logins stay admins
addColumn('users', 'is_artist', 'INTEGER NOT NULL DEFAULT 0');
addColumn('users', 'team_member_id', 'INTEGER REFERENCES team_members(id) ON DELETE SET NULL');
addColumn('customers', 'instagram', "TEXT DEFAULT ''");
addColumn('services', 'color', "TEXT NOT NULL DEFAULT ''"); // '' = use the artist's colour
addColumn('customers', 'facebook', "TEXT DEFAULT ''");
addColumn('booking_photos', 'thumb', 'BLOB'); // small JPEG preview (~240px) made by the browser; NULL for old photos until backfilled
addColumn('team_members', 'sort_order', 'INTEGER NOT NULL DEFAULT 0'); // 0 = not ordered yet (listed last, by id)

export const DEFAULT_SETTINGS = {
  businessName: 'Phoenix Studio',
  timezone: 'Europe/Paris',
  currency: '€',
  dayStart: '08:00',
  dayEnd: '21:00',
  // 0 = Sunday ... 6 = Saturday
  openDays: [1, 2, 3, 4, 5, 6],
  slotMinutes: 30,
  // appointment colour in the calendar: 'service' (booking type, falls back to the artist) or 'artist'
  colorBy: 'service',
};

export function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const s = { ...DEFAULT_SETTINGS };
  for (const r of rows) s[r.key] = JSON.parse(r.value);
  return s;
}

export function saveSettings(patch) {
  const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const [k, v] of Object.entries(patch)) {
    if (k in DEFAULT_SETTINGS) stmt.run(k, JSON.stringify(v));
  }
  return getSettings();
}

// Booking reference like "KG2005": 2 letters + 4 digits, unique
export function newRef() {
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (;;) {
    const ref = L[Math.floor(Math.random() * L.length)] + L[Math.floor(Math.random() * L.length)] +
      String(Math.floor(1000 + Math.random() * 9000));
    if (!db.prepare('SELECT 1 FROM bookings WHERE ref = ?').get(ref)) return ref;
  }
}

// ---------- first-run seed (fictional demo data) ----------
function pad(n) { return String(n).padStart(2, '0'); }
function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

export function seedIfEmpty() {
  const hasLoc = db.prepare('SELECT COUNT(*) AS c FROM locations').get().c;
  if (hasLoc) return;

  db.prepare('INSERT INTO locations (name) VALUES (?)').run('Phoenix Studio');
  db.prepare('INSERT INTO team_members (name, color) VALUES (?, ?)').run('Manu Tattoo', '#C8643F');
  const svc = db.prepare('INSERT INTO services (name, duration_min, price) VALUES (?, ?, ?)');
  svc.run('Tattoo', 60, 0);
  svc.run('Consultation', 30, 0);
  svc.run('Retouche', 30, 0);
  svc.run('Piercing', 30, 40);

  if (process.env.SEED_DEMO === 'false') return;

  const cust = db.prepare('INSERT INTO customers (name, phone, email, created_at) VALUES (?, ?, ?, ?)');
  const demo = [
    ['Demo – Alice Martin', '+33 6 00 00 00 01', 'alice@example.com'],
    ['Demo – Hugo Bernard', '+33 6 00 00 00 02', ''],
    ['Demo – Léa Petit', '+33 6 00 00 00 03', 'lea@example.com'],
    ['Demo – Nathan Roux', '', ''],
    ['Demo – Chloé Moreau', '+33 6 00 00 00 05', ''],
  ];
  const today = new Date();
  const ids = demo.map(([n, p, e]) => Number(cust.run(n, p, e, ymd(today)).lastInsertRowid));

  // Put a handful of bookings in the current week so the calendar isn't empty
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const add = (dayOffset, start, end, custIdx, notes = '') => {
    const d = new Date(monday); d.setDate(monday.getDate() + dayOffset);
    db.prepare(`INSERT INTO bookings (ref, type, customer_id, location_id, service_id, team_member_id, start, end, notes)
                VALUES (?, 'appointment', ?, 1, 1, 1, ?, ?, ?)`)
      .run(newRef(), ids[custIdx], `${ymd(d)} ${start}`, `${ymd(d)} ${end}`, notes);
  };
  add(0, '16:15', '17:15', 0, 'Fine line, forearm');
  add(2, '17:00', '18:00', 1);
  add(3, '15:30', '16:30', 2, 'Deposit paid');
  add(4, '11:00', '12:00', 3);
  add(4, '12:30', '14:00', 4);
  add(5, '14:00', '15:00', 0);
  const tue = new Date(monday); tue.setDate(monday.getDate() + 1);
  db.prepare(`INSERT INTO bookings (ref, type, title, location_id, team_member_id, start, end)
              VALUES (?, 'blocker', 'Time Blocker', 1, 1, ?, ?)`)
    .run(newRef(), `${ymd(tue)} 11:00`, `${ymd(tue)} 18:00`);
}
