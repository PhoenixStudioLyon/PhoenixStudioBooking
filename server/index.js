// Phoenix Studio booking server — zero dependencies (Node >= 22.13)
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { randomBytes, scryptSync, timingSafeEqual, randomUUID } from 'node:crypto';
import { dirname, extname, join, resolve, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, getSettings, saveSettings, newRef, seedIfEmpty } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const STATIC_DIR = resolve(__dirname, '../client/dist');
const SESSION_DAYS = 30;
const SECURE_COOKIE = process.env.COOKIE_SECURE === 'true';

seedIfEmpty();

// ---------------------------------------------------------------- helpers
class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}
const bad = (msg) => { throw new HttpError(400, msg); };
const notFound = (what = 'Not found') => { throw new HttpError(404, what); };

function hashPassword(pw) {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${scryptSync(pw, salt, 64).toString('hex')}`;
}
function checkPassword(pw, stored) {
  const [saltHex, hashHex] = stored.split(':');
  const a = scryptSync(pw, Buffer.from(saltHex, 'hex'), 64);
  const b = Buffer.from(hashHex, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* ignore malformed cookie */ }
  }
  return out;
}
function sessionCookie(token, maxAgeSec) {
  return `sid=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSec}${SECURE_COOKIE ? '; Secure' : ''}`;
}
function createSession(res, userId) {
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expires);
  res.setHeader('Set-Cookie', sessionCookie(token, SESSION_DAYS * 86400));
}
function currentUser(req) {
  const token = parseCookies(req).sid;
  if (!token) return null;
  const row = db.prepare(`SELECT u.*, s.expires_at FROM sessions s
                          JOIN users u ON u.id = s.user_id WHERE s.token = ?`).get(token);
  if (!row) return null;
  if (row.expires_at < new Date().toISOString()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return publicUser(row);
}
function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, is_admin: !!u.is_admin, is_artist: !!u.is_artist, team_member_id: u.team_member_id ?? null };
}

// ---------------------------------------------------------------- permissions
// Artists (non-admin logins) see client names as "Damien ***" and never get phone, email or socials.
const maskName = (name) => {
  const first = String(name || '').trim().split(/\s+/)[0];
  return first ? `${first} ***` : '***';
};
function forViewer(b, user) {
  if (!b || user.is_admin) return b;
  return { ...b, customer_name: b.customer_name == null ? null : maskName(b.customer_name), customer_phone: '', customer_email: '' };
}
const maskCustomer = (c) => ({ id: c.id, name: maskName(c.name), booking_count: c.booking_count });
// An artist may change a booking only when it's in their own column
function assertCanEdit(user, booking) {
  if (user.is_admin) return;
  if (!user.is_artist || !user.team_member_id || booking.team_member_id !== user.team_member_id)
    throw new HttpError(403, "You can only change your own appointments");
}

async function readJson(req, max = 1e6) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > max) bad('Body too large'); chunks.push(c); }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { bad('Invalid JSON'); }
}
async function readRaw(req, max) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > max) throw new HttpError(413, 'File too large'); chunks.push(c); }
  return Buffer.concat(chunks);
}
function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
// A login is identified by an email or a simple ID such as "admin"
const validLoginId = (id) => /^[^\s@]+@[^\s@]+$/.test(id) || /^[a-z0-9._-]{3,}$/i.test(id);
const str = (v, max = 2000) => (v == null ? '' : String(v).trim().slice(0, max));
const DT_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;

// ---------------------------------------------------------------- login throttling
// After too many wrong passwords the login is refused for a while (HTTP 429), even with the right password.
// Two counters: per account + client address (normal protection), and per account alone with a higher limit
// (so changing address doesn't help an attacker, without letting one person lock the owner out too easily).
const FAIL_WINDOW = 15 * 60 * 1000, LOCK_TIME = 15 * 60 * 1000;
const LIMIT_PER_CLIENT = 10, LIMIT_PER_ACCOUNT = 30;
const failures = new Map(); // key -> { count, first, lockedUntil }
const clientAddress = (req) => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';
function throttleKeys(req, account) {
  const acc = String(account || '').trim().toLowerCase();
  return [[`c|${acc}|${clientAddress(req)}`, LIMIT_PER_CLIENT], [`a|${acc}`, LIMIT_PER_ACCOUNT]];
}
function assertNotLocked(keys) {
  const now = Date.now();
  for (const [k] of keys) {
    const f = failures.get(k);
    if (f?.lockedUntil > now) {
      const min = Math.ceil((f.lockedUntil - now) / 60000);
      throw new HttpError(429, `Too many wrong passwords. Try again in ${min} minute${min > 1 ? 's' : ''}.`);
    }
  }
}
function recordFailure(keys) {
  const now = Date.now();
  for (const [k, limit] of keys) {
    let f = failures.get(k);
    if (!f || now - f.first > FAIL_WINDOW) f = { count: 0, first: now, lockedUntil: 0 };
    f.count++;
    if (f.count >= limit) f.lockedUntil = now + LOCK_TIME;
    failures.set(k, f);
  }
}
const clearFailures = (keys) => keys.forEach(([k]) => failures.delete(k));
setInterval(() => { // forget old entries
  const now = Date.now();
  for (const [k, f] of failures) if (now - f.first > FAIL_WINDOW && !(f.lockedUntil > now)) failures.delete(k);
}, 10 * 60 * 1000).unref();

// ---------------------------------------------------------------- router
const routes = [];
const route = (method, pattern, handler, { auth = true, admin = false } = {}) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, handler, auth, admin });
};
const ADMIN = { admin: true };

// ----- auth
route('GET', '/api/auth/status', (req) => {
  const hasUsers = db.prepare('SELECT COUNT(*) AS c FROM users').get().c > 0;
  return { hasUsers, user: currentUser(req), settings: getSettings() };
}, { auth: false });

route('POST', '/api/auth/setup', async (req, res) => {
  if (db.prepare('SELECT COUNT(*) AS c FROM users').get().c > 0) throw new HttpError(403, 'Account already set up');
  const b = await readJson(req);
  const name = str(b.name, 100), email = str(b.email, 200).toLowerCase(), password = String(b.password || '');
  if (!name || !validLoginId(email)) bad('Name and a valid email or ID (3+ letters, digits, . _ -) are required');
  if (password.length < 8) bad('Password must be at least 8 characters');
  const id = Number(db.prepare('INSERT INTO users (name, email, password_hash, is_admin) VALUES (?, ?, ?, 1)')
    .run(name, email, hashPassword(password)).lastInsertRowid);
  if (b.businessName) saveSettings({ businessName: str(b.businessName, 100) });
  createSession(res, id);
  return { user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)) };
}, { auth: false });

route('POST', '/api/auth/login', async (req, res) => {
  const b = await readJson(req);
  const keys = throttleKeys(req, b.email);
  assertNotLocked(keys);
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(str(b.email, 200));
  if (!u || !checkPassword(String(b.password || ''), u.password_hash)) {
    recordFailure(keys);
    throw new HttpError(401, 'Wrong email or password');
  }
  clearFailures(keys);
  createSession(res, u.id);
  return { user: publicUser(u) };
}, { auth: false });

route('POST', '/api/auth/logout', (req, res) => {
  const token = parseCookies(req).sid;
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.setHeader('Set-Cookie', sessionCookie('', 0));
  return { ok: true };
}, { auth: false });

route('POST', '/api/auth/password', async (req, _res, _p, user) => {
  const b = await readJson(req);
  const keys = throttleKeys(req, `pw:${user.id}`);
  assertNotLocked(keys);
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  if (!checkPassword(String(b.current || ''), u.password_hash)) { recordFailure(keys); bad('Current password is wrong'); }
  if (String(b.next || '').length < 8) bad('New password must be at least 8 characters');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(String(b.next)), user.id);
  // log out every other device of this user (this one stays logged in)
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(user.id, parseCookies(req).sid || '');
  return { ok: true };
});

const USER_SELECT = `SELECT u.id, u.name, u.email, u.is_admin, u.is_artist, u.team_member_id, u.created_at,
  t.name AS team_member_name, t.color AS team_member_color FROM users u LEFT JOIN team_members t ON t.id = u.team_member_id`;
const adminCount = () => db.prepare('SELECT COUNT(*) AS c FROM users WHERE is_admin = 1').get().c;

function validateRoles(b) {
  const is_admin = b.is_admin ? 1 : 0, is_artist = b.is_artist ? 1 : 0;
  if (!is_admin && !is_artist) bad('Choose at least one role: Admin or Tattoo artist');
  const team_member_id = b.team_member_id ? Number(b.team_member_id) : null;
  if (is_artist && !team_member_id) bad('Choose which artist (team member) this login is');
  if (team_member_id && !db.prepare('SELECT 1 FROM team_members WHERE id = ? AND active = 1').get(team_member_id)) bad('Unknown team member');
  return { is_admin, is_artist, team_member_id };
}

route('GET', '/api/users', () => db.prepare(`${USER_SELECT} ORDER BY u.id`).all(), ADMIN);
route('POST', '/api/users', async (req) => {
  const b = await readJson(req);
  const name = str(b.name, 100), email = str(b.email, 200).toLowerCase(), password = String(b.password || '');
  if (!name || !validLoginId(email)) bad('Name and a valid email or ID (3+ letters, digits, . _ -) are required');
  if (password.length < 8) bad('Password must be at least 8 characters');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) bad('A login with this email already exists');
  const r = validateRoles(b);
  const id = Number(db.prepare('INSERT INTO users (name, email, password_hash, is_admin, is_artist, team_member_id) VALUES (?, ?, ?, ?, ?, ?)')
    .run(name, email, hashPassword(password), r.is_admin, r.is_artist, r.team_member_id).lastInsertRowid);
  return db.prepare(`${USER_SELECT} WHERE u.id = ?`).get(id);
}, ADMIN);
route('PUT', '/api/users/:id', async (req, _res, p, me) => {
  const cur = db.prepare('SELECT * FROM users WHERE id = ?').get(p.id) || notFound('Login not found');
  const b = await readJson(req);
  const name = str(b.name ?? cur.name, 100), email = str(b.email ?? cur.email, 200).toLowerCase();
  if (!name || !validLoginId(email)) bad('Name and a valid email or ID (3+ letters, digits, . _ -) are required');
  if (db.prepare('SELECT 1 FROM users WHERE email = ? AND id != ?').get(email, cur.id)) bad('A login with this email already exists');
  const r = validateRoles({ is_admin: cur.is_admin, is_artist: cur.is_artist, team_member_id: cur.team_member_id, ...b });
  if (cur.is_admin && !r.is_admin) {
    if (cur.id === me.id) bad("You can't remove your own admin role");
    if (adminCount() <= 1) bad('There must be at least one admin');
  }
  db.prepare('UPDATE users SET name = ?, email = ?, is_admin = ?, is_artist = ?, team_member_id = ? WHERE id = ?')
    .run(name, email, r.is_admin, r.is_artist, r.team_member_id, cur.id);
  if (b.password) {
    if (String(b.password).length < 8) bad('Password must be at least 8 characters');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(String(b.password)), cur.id);
    // a password reset by an admin logs that person out everywhere (except the admin's own current device)
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(cur.id, parseCookies(req).sid || '');
  }
  return db.prepare(`${USER_SELECT} WHERE u.id = ?`).get(cur.id);
}, ADMIN);
route('DELETE', '/api/users/:id', (_req, _res, p, me) => {
  const cur = db.prepare('SELECT * FROM users WHERE id = ?').get(p.id) || notFound('Login not found');
  if (cur.id === me.id) bad("You can't delete your own login");
  if (cur.is_admin && adminCount() <= 1) bad('There must be at least one admin');
  db.prepare('DELETE FROM users WHERE id = ?').run(cur.id);
  return { ok: true };
}, ADMIN);

// ----- settings & reference data
route('GET', '/api/meta', () => ({
  settings: getSettings(),
  locations: db.prepare('SELECT * FROM locations ORDER BY id').all(),
  team: db.prepare('SELECT * FROM team_members WHERE active = 1 ORDER BY (sort_order = 0), sort_order, id').all(),
  services: db.prepare('SELECT * FROM services WHERE active = 1 ORDER BY id').all(),
}));
route('PUT', '/api/settings', async (req) => saveSettings(await readJson(req)), ADMIN);

// Display order of the artists (Team Members page, calendar columns, lists): ids in the wanted order
route('PUT', '/api/team/order', async (req) => {
  const { ids = [] } = await readJson(req);
  if (!Array.isArray(ids)) bad('ids must be a list');
  const set = db.prepare('UPDATE team_members SET sort_order = ? WHERE id = ?');
  db.exec('BEGIN');
  try { ids.forEach((id, i) => set.run(i + 1, Number(id))); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
  return { ok: true };
}, ADMIN);

// simple CRUD for locations / team members / services
const simpleTables = {
  locations: ['name', 'address'],
  team: ['name', 'color', 'email', 'phone', 'role'],
  services: ['name', 'duration_min', 'price', 'color'],
};
const tableName = { locations: 'locations', team: 'team_members', services: 'services' };
for (const [path, cols] of Object.entries(simpleTables)) {
  const t = tableName[path];
  route('POST', `/api/${path}`, async (req) => {
    const b = await readJson(req);
    if (!str(b.name)) bad('Name is required');
    const use = cols.filter((c) => b[c] !== undefined);
    const id = db.prepare(`INSERT INTO ${t} (${use.join(',')}) VALUES (${use.map(() => '?').join(',')})`)
      .run(...use.map((c) => b[c])).lastInsertRowid;
    return db.prepare(`SELECT * FROM ${t} WHERE id = ?`).get(id);
  }, ADMIN);
  route('PUT', `/api/${path}/:id`, async (req, _res, p) => {
    const b = await readJson(req);
    const use = cols.filter((c) => b[c] !== undefined);
    if (use.length) db.prepare(`UPDATE ${t} SET ${use.map((c) => `${c} = ?`).join(',')} WHERE id = ?`).run(...use.map((c) => b[c]), p.id);
    return db.prepare(`SELECT * FROM ${t} WHERE id = ?`).get(p.id) || notFound();
  }, ADMIN);
  // team members & services are archived (not erased) so past bookings keep their names
  route('DELETE', `/api/${path}/:id`, (_req, _res, p) => {
    if (t === 'locations') {
      if (db.prepare('SELECT COUNT(*) AS c FROM locations').get().c <= 1) bad('You need at least one location');
      db.prepare('DELETE FROM locations WHERE id = ?').run(p.id);
    } else {
      if (t === 'team_members' && db.prepare('SELECT COUNT(*) AS c FROM team_members WHERE active = 1').get().c <= 1)
        bad('You need at least one team member');
      db.prepare(`UPDATE ${t} SET active = 0 WHERE id = ?`).run(p.id);
    }
    return { ok: true };
  }, ADMIN);
}

// team member list with upcoming booking counts (for the Team Members page)
route('GET', '/api/team', () => {
  const today = new Date().toISOString().slice(0, 10);
  return db.prepare(`SELECT t.*,
      (SELECT COUNT(*) FROM bookings b WHERE b.team_member_id = t.id AND b.type = 'appointment'
         AND b.status != 'cancelled' AND b.start >= ?) AS upcoming
    FROM team_members t WHERE t.active = 1 ORDER BY (t.sort_order = 0), t.sort_order, t.id`).all(today);
}, ADMIN);

// ----- customers
const CUSTOMER_FIELDS = ['name', 'phone', 'alt_phone', 'email', 'instagram', 'facebook', 'gender', 'birthday', 'address', 'city', 'postcode', 'country', 'notes'];

// The part of a customer name artists can see ("Damien" of "Damien Goncalvez"); they can only search on it,
// otherwise searching a surname would confirm a hidden name.
const FIRST_WORD = (col) => `substr(trim(${col}) || ' ', 1, instr(trim(${col}) || ' ', ' ') - 1)`;

// Artists use this only to pick a client when booking: they search by first name and get masked results.
route('GET', '/api/customers', (req, _res, _p, user) => {
  const url = new URL(req.url, 'http://x');
  const q = `%${str(url.searchParams.get('q'), 100)}%`;
  const limit = Math.min(Number(url.searchParams.get('limit')) || 500, 5000);
  const count = `(SELECT COUNT(*) FROM bookings b WHERE b.customer_id = c.id AND b.status != 'cancelled') AS booking_count`;
  if (!user.is_admin) {
    return db.prepare(`SELECT c.id, c.name, ${count} FROM customers c WHERE ${FIRST_WORD('c.name')} LIKE ?
      ORDER BY c.name COLLATE NOCASE LIMIT ?`).all(`${str(url.searchParams.get('q'), 100)}%`, Math.min(limit, 50)).map(maskCustomer);
  }
  return db.prepare(`
    SELECT c.*, ${count}
    FROM customers c
    WHERE c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR c.instagram LIKE ? OR c.facebook LIKE ?
    ORDER BY c.name COLLATE NOCASE LIMIT ?`).all(q, q, q, q, q, limit);
});

route('GET', '/api/customers/:id', (_req, _res, p) => {
  const c = db.prepare('SELECT * FROM customers WHERE id = ?').get(p.id) || notFound('Customer not found');
  c.bookings = db.prepare(`${BOOKING_SELECT} WHERE b.customer_id = ? ORDER BY b.start DESC`).all(p.id);
  return c;
}, ADMIN);

// Artists may add a new client while booking; they get the masked version back.
route('POST', '/api/customers', async (req, _res, _p, user) => {
  const b = await readJson(req);
  if (!str(b.name)) bad('Customer name is required');
  const vals = CUSTOMER_FIELDS.map((f) => str(b[f]));
  const id = db.prepare(`INSERT INTO customers (${CUSTOMER_FIELDS.join(',')}) VALUES (${CUSTOMER_FIELDS.map(() => '?').join(',')})`)
    .run(...vals).lastInsertRowid;
  const c = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  return user.is_admin ? c : maskCustomer(c);
});

route('PUT', '/api/customers/:id', async (req, _res, p) => {
  const b = await readJson(req);
  const use = CUSTOMER_FIELDS.filter((f) => b[f] !== undefined);
  if (use.includes('name') && !str(b.name)) bad('Customer name is required');
  if (use.length) db.prepare(`UPDATE customers SET ${use.map((f) => `${f} = ?`).join(',')} WHERE id = ?`)
    .run(...use.map((f) => str(b[f])), p.id);
  return db.prepare('SELECT * FROM customers WHERE id = ?').get(p.id) || notFound('Customer not found');
}, ADMIN);

route('DELETE', '/api/customers/:id', (_req, _res, p) => {
  db.prepare('DELETE FROM customers WHERE id = ?').run(p.id);
  return { ok: true };
}, ADMIN);

// Import many customers at once (e.g. a Picktime export parsed in the browser).
// A row is skipped when a customer with the same name and phone already exists.
route('POST', '/api/customers/import', async (req) => {
  const { customers = [] } = await readJson(req, 20e6);
  if (!Array.isArray(customers) || customers.length > 20000) bad('Send up to 20000 customers');
  const key = (name, phone) => `${String(name).trim().toLowerCase()}|${String(phone || '').replace(/\D/g, '')}`;
  const seen = new Set(db.prepare('SELECT name, phone FROM customers').all().map((c) => key(c.name, c.phone)));
  const ins = db.prepare(`INSERT INTO customers (${CUSTOMER_FIELDS.join(',')}) VALUES (${CUSTOMER_FIELDS.map(() => '?').join(',')})`);
  let added = 0, skipped = 0, invalid = 0;
  db.exec('BEGIN');
  try {
    for (const c of customers) {
      const name = str(c?.name, 200);
      if (!name) { invalid++; continue; }
      const k = key(name, c.phone);
      if (seen.has(k)) { skipped++; continue; }
      seen.add(k);
      ins.run(...CUSTOMER_FIELDS.map((f) => (f === 'name' ? name : str(c[f]))));
      added++;
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return { added, skipped, invalid };
}, ADMIN);

route('POST', '/api/customers/bulk-delete', async (req) => {
  const { ids = [] } = await readJson(req);
  const del = db.prepare('DELETE FROM customers WHERE id = ?');
  for (const id of ids) del.run(Number(id));
  return { ok: true, deleted: ids.length };
}, ADMIN);

// ----- bookings
const BOOKING_SELECT = `
  SELECT b.*, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email,
         (SELECT COUNT(*) FROM booking_photos p WHERE p.booking_id = b.id) AS photo_count,
         (SELECT a.user_name FROM activity_log a WHERE a.booking_id = b.id AND a.action = 'created' ORDER BY a.id LIMIT 1) AS created_by,
         s.name AS service_name, s.color AS service_color, t.name AS team_member_name, t.color AS team_member_color, l.name AS location_name
  FROM bookings b
  LEFT JOIN customers c ON c.id = b.customer_id
  LEFT JOIN services s ON s.id = b.service_id
  LEFT JOIN team_members t ON t.id = b.team_member_id
  LEFT JOIN locations l ON l.id = b.location_id`;

route('GET', '/api/bookings', (req, _res, _p, user) => {
  const u = new URL(req.url, 'http://x').searchParams;
  const where = [], args = [];
  if (u.get('from')) { where.push('b.end > ?'); args.push(u.get('from')); }
  if (u.get('to')) { where.push('b.start < ?'); args.push(u.get('to')); }
  if (u.get('team_member_id')) { where.push('b.team_member_id = ?'); args.push(Number(u.get('team_member_id'))); }
  if (u.get('location_id')) { where.push('b.location_id = ?'); args.push(Number(u.get('location_id'))); }
  if (u.get('hide_cancelled') === '1') where.push("b.status != 'cancelled'");
  if (u.get('q')) {
    const q = `%${str(u.get('q'), 100)}%`;
    if (user.is_admin) { where.push('(b.ref LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)'); args.push(q, q, q); }
    else { where.push(`(b.ref LIKE ? OR ${FIRST_WORD('c.name')} LIKE ?)`); args.push(q, `${str(u.get('q'), 100)}%`); }
  }
  const sql = `${BOOKING_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY b.start LIMIT 2000`;
  return db.prepare(sql).all(...args).map((b) => forViewer(b, user));
});

route('GET', '/api/bookings/:id', (_req, _res, p, user) =>
  forViewer(db.prepare(`${BOOKING_SELECT} WHERE b.id = ?`).get(p.id) || notFound('Booking not found'), user));

function addInterval(dt, freq, i) {
  const [d, t] = dt.split(' ');
  const [y, m, day] = d.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, day));
  if (freq === 'daily') date.setUTCDate(date.getUTCDate() + i);
  if (freq === 'weekly') date.setUTCDate(date.getUTCDate() + 7 * i);
  if (freq === 'biweekly') date.setUTCDate(date.getUTCDate() + 14 * i);
  if (freq === 'monthly') date.setUTCMonth(date.getUTCMonth() + i);
  return `${date.toISOString().slice(0, 10)} ${t}`;
}

function validateBooking(b) {
  const type = b.type === 'blocker' ? 'blocker' : 'appointment';
  if (!DT_RE.test(b.start || '') || !DT_RE.test(b.end || '')) bad('Start and end must look like YYYY-MM-DD HH:MM');
  if (b.end <= b.start) bad('End time must be after start time');
  if (type === 'appointment' && !b.customer_id) bad('Please choose a customer');
  if (type === 'appointment' && !b.service_id) bad('Please choose a service');
  const status = ['confirmed', 'pending', 'completed', 'no_show', 'cancelled'].includes(b.status) ? b.status : 'confirmed';
  return {
    type, status,
    title: str(b.title, 200) || (type === 'blocker' ? 'Time Blocker' : ''),
    customer_id: type === 'appointment' ? Number(b.customer_id) : null,
    location_id: b.location_id ? Number(b.location_id) : null,
    service_id: type === 'appointment' ? Number(b.service_id) : null,
    team_member_id: b.team_member_id ? Number(b.team_member_id) : null,
    start: b.start, end: b.end,
    price: Number(b.price) || 0,
    notes: str(b.notes, 5000),
  };
}

function findOverlaps(v, excludeId = 0) {
  if (!v.team_member_id || v.status === 'cancelled') return [];
  return db.prepare(`${BOOKING_SELECT} WHERE b.team_member_id = ? AND b.status != 'cancelled'
                     AND b.start < ? AND b.end > ? AND b.id != ?`).all(v.team_member_id, v.end, v.start, excludeId);
}

// ----- activity log (Reports page)
const STATUS_LABEL = { confirmed: 'Confirmed', pending: 'Pending', completed: 'Completed', no_show: 'No-show', cancelled: 'Cancelled' };
const fmtDT = (dt) => (dt ? `${dt.slice(8, 10)}/${dt.slice(5, 7)}/${dt.slice(0, 4)} ${dt.slice(11)}` : '');
const bookingView = (id) => db.prepare(`${BOOKING_SELECT} WHERE b.id = ?`).get(id);
const subjectOf = (b) => (b.type === 'blocker' ? (b.title || 'Time Blocker') : (b.customer_name || 'Unknown customer'));
// Readable values of a booking, compared field by field to describe a change
function describe(b) {
  const sameDay = b.start.slice(0, 10) === b.end.slice(0, 10);
  const d = {
    When: `${fmtDT(b.start)} – ${sameDay ? b.end.slice(11) : fmtDT(b.end)}`,
    Artist: b.team_member_name || '',
    Location: b.location_name || '',
  };
  if (b.type === 'blocker') d.Title = b.title || '';
  else Object.assign(d, { Customer: b.customer_name || '', Service: b.service_name || '', Status: STATUS_LABEL[b.status] || b.status, Price: String(Number(b.price) || 0) });
  d.Notes = b.notes || '';
  return d;
}
function diff(before, after) {
  const a = describe(before), b = describe(after);
  return [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .filter((k) => (a[k] ?? '') !== (b[k] ?? '')).map((k) => ({ label: k, from: a[k] ?? '', to: b[k] ?? '' }));
}
function logActivity(user, action, b, changes = []) {
  db.prepare(`INSERT INTO activity_log (user_id, user_name, action, booking_id, booking_ref, booking_type, subject, team_member_name, changes)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(user?.id ?? null, user?.name || '', action, b.id, b.ref || '', b.type, subjectOf(b), b.team_member_name || '', JSON.stringify(changes));
}

route('GET', '/api/activity', (req) => {
  const u = new URL(req.url, 'http://x').searchParams;
  const where = [], args = [];
  // from/to are local calendar days; `at` is UTC, so the client sends the UTC bounds it wants
  if (u.get('from')) { where.push('at >= ?'); args.push(u.get('from')); }
  if (u.get('to')) { where.push('at < ?'); args.push(u.get('to')); }
  if (u.get('user_id')) { where.push('user_id = ?'); args.push(Number(u.get('user_id'))); }
  if (u.get('action')) { where.push('action = ?'); args.push(u.get('action')); }
  if (u.get('q')) {
    const q = `%${str(u.get('q'), 100)}%`;
    where.push('(subject LIKE ? OR booking_ref LIKE ? OR user_name LIKE ? OR team_member_name LIKE ?)'); args.push(q, q, q, q);
  }
  const limit = Math.min(Number(u.get('limit')) || 100, 1000), offset = Math.max(Number(u.get('offset')) || 0, 0);
  const rows = db.prepare(`SELECT * FROM activity_log ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                           ORDER BY id DESC LIMIT ? OFFSET ?`).all(...args, limit + 1, offset);
  return { items: rows.slice(0, limit).map((r) => ({ ...r, changes: JSON.parse(r.changes) })), more: rows.length > limit };
}, ADMIN);

route('POST', '/api/bookings', async (req, _res, _p, user) => {
  const b = await readJson(req);
  if (!user.is_admin) {
    if (!user.is_artist || !user.team_member_id) throw new HttpError(403, 'Your login is not linked to an artist');
    b.team_member_id = user.team_member_id; // artists book in their own column only
  }
  const base = validateBooking(b);
  const freq = b.recurrence?.freq;
  const count = ['daily', 'weekly', 'biweekly', 'monthly'].includes(freq) ? Math.min(Math.max(Number(b.recurrence.count) || 1, 1), 52) : 1;
  const seriesId = count > 1 ? randomUUID() : null;
  const items = Array.from({ length: count }, (_, i) =>
    ({ ...base, start: addInterval(base.start, freq, i), end: addInterval(base.end, freq, i) }));

  if (!b.allowOverlap) {
    const clashes = items.flatMap((it) => findOverlaps(it));
    if (clashes.length) throw new HttpError(409, 'This time overlaps another booking', { overlaps: clashes.map((c) => forViewer(c, user)) });
  }
  const ins = db.prepare(`INSERT INTO bookings (ref, type, title, customer_id, location_id, service_id, team_member_id,
                          start, end, price, notes, status, series_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const ids = [];
  db.exec('BEGIN');
  try {
    for (const it of items) {
      ids.push(Number(ins.run(newRef(), it.type, it.title, it.customer_id, it.location_id, it.service_id, it.team_member_id,
        it.start, it.end, it.price, it.notes, it.status, seriesId).lastInsertRowid));
    }
    // one entry per new booking (a recurring series says which occurrence it is)
    ids.forEach((id, i) => {
      const nb = bookingView(id);
      const changes = Object.entries(describe(nb)).filter(([, v]) => v && v !== '0').map(([label, to]) => ({ label, from: '', to }));
      if (ids.length > 1) changes.push({ label: 'Series', from: '', to: `${i + 1} of ${ids.length} (${freq})` });
      logActivity(user, 'created', nb, changes);
    });
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return db.prepare(`${BOOKING_SELECT} WHERE b.id IN (${ids.map(() => '?').join(',')}) ORDER BY b.start`).all(...ids)
    .map((x) => forViewer(x, user));
});

route('PUT', '/api/bookings/:id', async (req, _res, p, user) => {
  const cur = db.prepare('SELECT * FROM bookings WHERE id = ?').get(p.id) || notFound('Booking not found');
  assertCanEdit(user, cur);
  const b = await readJson(req);
  if (!user.is_admin) b.team_member_id = user.team_member_id; // can't hand a booking to someone else
  const v = validateBooking({ ...cur, ...b });
  if (!b.allowOverlap) {
    const clashes = findOverlaps(v, cur.id);
    if (clashes.length) throw new HttpError(409, 'This time overlaps another booking', { overlaps: clashes.map((c) => forViewer(c, user)) });
  }
  const before = bookingView(cur.id);
  db.prepare(`UPDATE bookings SET type=?, title=?, customer_id=?, location_id=?, service_id=?, team_member_id=?,
              start=?, end=?, price=?, notes=?, status=? WHERE id = ?`)
    .run(v.type, v.title, v.customer_id, v.location_id, v.service_id, v.team_member_id, v.start, v.end, v.price, v.notes, v.status, cur.id);
  const after = bookingView(cur.id);
  const changes = diff(before, after);
  if (changes.length) {
    const labels = changes.map((c) => c.label);
    const action = labels.every((l) => l === 'Status') ? 'status'
      : labels.every((l) => l === 'When' || l === 'Artist') ? 'moved' : 'edited';
    logActivity(user, action, after, changes);
  }
  return forViewer(after, user);
});

route('DELETE', '/api/bookings/:id', (_req, _res, p, user) => {
  const b = bookingView(p.id);
  if (!b) return { ok: true };
  logActivity(user, 'deleted', b, Object.entries(describe(b)).filter(([, v]) => v && v !== '0').map(([label, from]) => ({ label, from, to: '' })));
  db.prepare('DELETE FROM bookings WHERE id = ?').run(p.id);
  return { ok: true };
}, ADMIN);

// ----- bulk import (e.g. a Picktime bookings export parsed in the browser)
// Each item: { artist, service, start, end, status, notes, blocker, title, customer: { name, phone, email, instagram } }
// Missing artists, services and customers are created. A booking already present (same artist, start and
// customer/title) is skipped, so importing the same file twice is safe. Overlaps are allowed (it's history).
const IMPORT_COLORS = ['#6F8A72', '#6F8FA6', '#B8893F', '#9A6A86', '#A0523D', '#5E7C8C', '#8A7A5C', '#B5707A', '#4F6B5A', '#C8643F'];
route('POST', '/api/bookings/import', async (req) => {
  const { bookings = [] } = await readJson(req, 20e6);
  if (!Array.isArray(bookings) || bookings.length > 20000) bad('Send up to 20000 bookings');
  const norm = (s) => String(s || '').trim().toLowerCase();
  const digits = (s) => String(s || '').replace(/\D/g, '');

  const team = new Map(db.prepare('SELECT id, name FROM team_members WHERE active = 1').all().map((t) => [norm(t.name), t.id]));
  const services = new Map(db.prepare('SELECT id, name FROM services WHERE active = 1').all().map((s) => [norm(s.name), s.id]));
  const customers = new Map();
  for (const c of db.prepare('SELECT id, name, phone FROM customers').all()) {
    customers.set(`${norm(c.name)}|${digits(c.phone)}`, c.id);
    if (!customers.has(`${norm(c.name)}|*`)) customers.set(`${norm(c.name)}|*`, c.id); // fallback when the booking has no phone
  }
  const existing = new Set(db.prepare('SELECT team_member_id, start, customer_id, title FROM bookings').all()
    .map((b) => `${b.team_member_id}|${b.start}|${b.customer_id || ''}|${b.customer_id ? '' : norm(b.title)}`));
  const location = db.prepare('SELECT id FROM locations ORDER BY id LIMIT 1').get()?.id ?? null;

  const insTeam = db.prepare('INSERT INTO team_members (name, color) VALUES (?, ?)');
  const insSvc = db.prepare('INSERT INTO services (name, duration_min, price) VALUES (?, 60, 0)');
  const insCust = db.prepare('INSERT INTO customers (name, phone, email, instagram) VALUES (?, ?, ?, ?)');
  const insBk = db.prepare(`INSERT INTO bookings (ref, type, title, customer_id, location_id, service_id, team_member_id,
                            start, end, price, notes, status) VALUES (?,?,?,?,?,?,?,?,?,0,?,?)`);
  const out = { added: 0, blockers: 0, skipped: 0, invalid: 0, artistsCreated: [], servicesCreated: [], customersCreated: 0 };

  db.exec('BEGIN');
  try {
    for (const b of bookings) {
      const start = String(b?.start || ''), end = String(b?.end || '');
      const artist = str(b?.artist, 100);
      if (!DT_RE.test(start) || !DT_RE.test(end) || end <= start || !artist) { out.invalid++; continue; }

      let teamId = team.get(norm(artist));
      if (!teamId) {
        teamId = Number(insTeam.run(artist, IMPORT_COLORS[out.artistsCreated.length % IMPORT_COLORS.length]).lastInsertRowid);
        team.set(norm(artist), teamId); out.artistsCreated.push(artist);
      }
      const status = ['confirmed', 'pending', 'completed', 'no_show', 'cancelled'].includes(b.status) ? b.status : 'confirmed';
      const notes = str(b.notes, 5000);

      if (b.blocker) {
        const title = str(b.title, 200) || 'Time Blocker';
        const key = `${teamId}|${start}||${norm(title)}`;
        if (existing.has(key)) { out.skipped++; continue; }
        existing.add(key);
        insBk.run(newRef(), 'blocker', title, null, location, null, teamId, start, end, notes, 'confirmed');
        out.blockers++; continue;
      }

      const svcName = str(b.service, 100) || 'Tattoo';
      let svcId = services.get(norm(svcName));
      if (!svcId) { svcId = Number(insSvc.run(svcName).lastInsertRowid); services.set(norm(svcName), svcId); out.servicesCreated.push(svcName); }

      const c = b.customer || {};
      const cname = str(c.name, 200) || 'Unknown customer';
      const phone = str(c.phone, 50);
      let custId = customers.get(`${norm(cname)}|${digits(phone)}`) ?? (phone ? undefined : customers.get(`${norm(cname)}|*`));
      if (!custId) {
        custId = Number(insCust.run(cname, phone, str(c.email, 200), str(c.instagram, 100)).lastInsertRowid);
        customers.set(`${norm(cname)}|${digits(phone)}`, custId);
        if (!customers.has(`${norm(cname)}|*`)) customers.set(`${norm(cname)}|*`, custId);
        out.customersCreated++;
      }
      const key = `${teamId}|${start}|${custId}|`;
      if (existing.has(key)) { out.skipped++; continue; }
      existing.add(key);
      insBk.run(newRef(), 'appointment', '', custId, location, svcId, teamId, start, end, notes, status);
      out.added++;
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return out;
}, ADMIN);

// ----- booking photos (stored in the database so backing up phoenix.db keeps them)
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];
const PHOTO_MAX = 15 * 1024 * 1024;
const PHOTO_META = 'SELECT id, booking_id, name, mime, length(data) AS size, (thumb IS NOT NULL) AS has_thumb, created_at FROM booking_photos';

route('GET', '/api/bookings/:id/photos', (_req, _res, p) =>
  db.prepare(`${PHOTO_META} WHERE booking_id = ? ORDER BY id`).all(p.id));

// body = the raw image bytes, Content-Type = its type, X-Filename = original name (URI-encoded)
route('POST', '/api/bookings/:id/photos', async (req, _res, p, user) => {
  assertCanEdit(user, db.prepare('SELECT * FROM bookings WHERE id = ?').get(p.id) || notFound('Booking not found'));
  const mime = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (!PHOTO_TYPES.includes(mime)) bad('Only JPEG, PNG, WebP, GIF or HEIC pictures can be added');
  const data = await readRaw(req, PHOTO_MAX);
  if (!data.length) bad('Empty file');
  let name = '';
  try { name = str(decodeURIComponent(req.headers['x-filename'] || ''), 200); } catch { /* keep empty */ }
  const id = db.prepare('INSERT INTO booking_photos (booking_id, name, mime, data) VALUES (?, ?, ?, ?)')
    .run(p.id, name, mime, data).lastInsertRowid;
  logActivity(user, 'photo_added', bookingView(p.id), [{ label: 'Photo', from: '', to: name || 'photo' }]);
  return db.prepare(`${PHOTO_META} WHERE id = ?`).get(id);
});

// Small preview shown in the photo squares (the full photo is only loaded when it's opened)
route('GET', '/api/photos/:id/thumb', (_req, res, p) => {
  const ph = db.prepare('SELECT thumb FROM booking_photos WHERE id = ? AND thumb IS NOT NULL').get(p.id) || notFound('No preview');
  res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': ph.thumb.length, 'Cache-Control': 'private, max-age=31536000, immutable' });
  res.end(ph.thumb);
});

// The browser sends the preview right after uploading a photo, or later for photos that don't have one yet.
// A preview is only set once, so a cached preview never becomes outdated.
route('POST', '/api/photos/:id/thumb', async (req, _res, p, user) => {
  const owner = db.prepare('SELECT b.* FROM booking_photos ph JOIN bookings b ON b.id = ph.booking_id WHERE ph.id = ?').get(p.id) || notFound('Photo not found');
  assertCanEdit(user, owner);
  if (String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'image/jpeg') bad('Preview must be a JPEG');
  const data = await readRaw(req, 400 * 1024);
  if (!data.length) bad('Empty preview');
  db.prepare('UPDATE booking_photos SET thumb = ? WHERE id = ? AND thumb IS NULL').run(data, p.id);
  return { ok: true };
});

route('GET', '/api/photos/:id', (_req, res, p) => {
  const ph = db.prepare('SELECT mime, data FROM booking_photos WHERE id = ?').get(p.id) || notFound('Photo not found');
  res.writeHead(200, { 'Content-Type': ph.mime, 'Content-Length': ph.data.length, 'Cache-Control': 'private, max-age=31536000, immutable' });
  res.end(ph.data);
});

route('DELETE', '/api/photos/:id', (_req, _res, p, user) => {
  const owner = db.prepare('SELECT b.* FROM booking_photos ph JOIN bookings b ON b.id = ph.booking_id WHERE ph.id = ?').get(p.id);
  if (!owner) return { ok: true };
  assertCanEdit(user, owner);
  const ph = db.prepare('SELECT name FROM booking_photos WHERE id = ?').get(p.id);
  db.prepare('DELETE FROM booking_photos WHERE id = ?').run(p.id);
  logActivity(user, 'photo_removed', bookingView(owner.id), [{ label: 'Photo', from: ph?.name || 'photo', to: '' }]);
  return { ok: true };
});

// ----- overview stats
route('GET', '/api/stats', () => {
  const today = new Date().toISOString().slice(0, 10);
  const one = (sql, ...a) => db.prepare(sql).get(...a).c;
  return {
    customers: one('SELECT COUNT(*) AS c FROM customers'),
    upcoming: one("SELECT COUNT(*) AS c FROM bookings WHERE type='appointment' AND status != 'cancelled' AND start >= ?", today),
    today: one("SELECT COUNT(*) AS c FROM bookings WHERE type='appointment' AND status != 'cancelled' AND substr(start,1,10) = ?", today),
    cancelled: one("SELECT COUNT(*) AS c FROM bookings WHERE status = 'cancelled'"),
  };
});

// ---------------------------------------------------------------- static files
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2' };

async function serveStatic(req, res) {
  let urlPath;
  try { urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
  catch { res.writeHead(400, { 'Content-Type': 'text/plain' }).end('Bad request'); return; }
  let file = normalize(join(STATIC_DIR, urlPath));
  if (file !== STATIC_DIR && !file.startsWith(STATIC_DIR + sep)) { res.writeHead(403).end(); return; }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
  } catch { file = join(STATIC_DIR, 'index.html'); } // SPA fallback
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Frontend not built. Run "npm run build" (or use the client dev server).');
  }
}

// ---------------------------------------------------------------- server
// Browser security headers on every response
const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com", "img-src 'self' data: blob:", "connect-src 'self'",
  "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'",
].join('; ');
function securityHeaders(res) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(self)');
  if (SECURE_COOKIE) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
}

const server = http.createServer(async (req, res) => {
  securityHeaders(res);
  let pathname;
  try { pathname = new URL(req.url, 'http://x').pathname; } catch { res.writeHead(400).end(); return; }
  if (!pathname.startsWith('/api/')) {
    // never let a problem serving a file take the whole server down
    return serveStatic(req, res).catch((e) => { console.error(e); if (!res.headersSent) res.writeHead(500).end(); });
  }
  try {
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = pathname.match(r.re);
      if (!m) continue;
      let params;
      try { params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])); } catch { bad('Bad address'); }
      const user = currentUser(req);
      if (r.auth && !user) throw new HttpError(401, 'Please log in');
      if (r.admin && !user.is_admin) throw new HttpError(403, 'Only an admin can do this');
      const out = await r.handler(req, res, params, user);
      if (res.headersSent) return; // handler already wrote a non-JSON response (e.g. a photo)
      return send(res, 200, out);
    }
    notFound('Unknown API route');
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message, ...(e.extra || {}) });
    console.error(e);
    send(res, 500, { error: 'Server error' });
  }
});

process.on('unhandledRejection', (e) => console.error('Unhandled error:', e));

server.listen(PORT, () => console.log(`Phoenix booking running on http://localhost:${PORT}`));
