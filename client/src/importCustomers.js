// Reading a customers CSV (Picktime export, or any file with Name/Phone/Email columns)

// RFC 4180 CSV: quoted fields, "" escapes, commas and newlines inside quotes
export function parseCsv(text) {
  const rows = []; let row = []; let field = ''; let quoted = false;
  text = text.replace(/^﻿/, '');
  const firstLine = text.slice(0, text.indexOf('\n') >>> 0);
  const sep = firstLine.split(';').length > firstLine.split(',').length ? ';' : ','; // Excel in French uses ";"
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

// "+33 6 94 49 12 83" for French mobiles, "+41 786824643" otherwise
export function formatPhone(cc, num) {
  const n = String(num || '').replace(/\D/g, '');
  if (!n) return '';
  const c = String(cc || '').replace(/\D/g, '');
  if (!c) return clean(num);
  if (c === '33' && n.length === 9) return `+33 ${n[0]} ${n.slice(1).match(/../g).join(' ')}`;
  return `+${c} ${n}`;
}

// Picktime names often carry the Instagram handle: "@sy.ya.395 ig", "Alexandra.ivancic ig", "Angélique Caseiro ig angel.co7"
const HANDLE = /^[A-Za-z0-9._]{2,30}$/;
const looksLikeHandle = (t) => HANDLE.test(t) && !t.endsWith('.') && /[._\d]/.test(t);
export function instagramFromName(name) {
  const tokens = name.split(/[\s/]+/).filter(Boolean);
  const at = tokens.find((t) => t.startsWith('@') && HANDLE.test(t.slice(1).replace(/[.,]$/, '')));
  if (at) return at.slice(1).replace(/[.,]$/, '').toLowerCase();
  const i = tokens.findIndex((t) => /^ig:?$/i.test(t));
  if (i < 0) return '';
  // The handle sits right before or after "ig". Best guess first: it has dots/underscores/digits;
  // then a word at the very start ("Alexan ig quang"); then an all-lowercase word (names are capitalised).
  const prev = i > 0 ? tokens[i - 1] : '', next = tokens[i + 1] || '';
  const lower = (t) => /^[a-z0-9._]{3,30}$/.test(t);
  const pick = [
    looksLikeHandle(prev) && prev,
    looksLikeHandle(next) && next,
    i === 1 && HANDLE.test(prev) && !prev.endsWith('.') && prev,
    lower(next) && next,
    lower(prev) && prev,
  ].find(Boolean);
  return pick ? pick.toLowerCase() : '';
}

const GENDER = { female: 'Female', male: 'Male', other: 'Other' };

// Turns CSV rows into customer objects. Returns { customers, format } or throws if no name column is found.
export function customersFromCsv(text) {
  const [header, ...data] = parseCsv(text);
  if (!header) throw new Error('The file is empty');
  const col = {};
  header.forEach((h, i) => { col[clean(h).toLowerCase()] = i; });
  const get = (r, ...names) => { for (const n of names) if (col[n] !== undefined && clean(r[col[n]])) return clean(r[col[n]]); return ''; };
  const isPicktime = col['full name'] !== undefined && col['mobile number'] !== undefined;
  if (!isPicktime && col.name === undefined && col['full name'] === undefined && col['first name'] === undefined)
    throw new Error('No "Name" or "Full Name" column found in this file');

  const customers = data.map((r) => {
    const name = get(r, 'full name', 'name') || clean(`${get(r, 'first name')} ${get(r, 'last name')}`);
    const birthday = get(r, 'dob [yyyy-mm-dd]', 'birthday');
    return {
      name,
      phone: isPicktime ? formatPhone(r[col['country code(mob no.)']], r[col['mobile number']]) : get(r, 'phone', 'mobile number', 'mobile'),
      alt_phone: isPicktime ? formatPhone(r[col['country code(alt mob no.)']], r[col['alternative mobile number']]) : get(r, 'alt phone', 'alternative number'),
      email: get(r, 'email', 'e-mail', 'e-mail id'),
      instagram: get(r, 'instagram') || instagramFromName(name),
      facebook: get(r, 'facebook'),
      address: get(r, 'address'),
      city: get(r, 'city'),
      postcode: get(r, 'zip', 'postcode', 'postal code'),
      country: get(r, 'country', 'state'),
      birthday: /^\d{4}-\d{2}-\d{2}$/.test(birthday) ? birthday : '',
      gender: GENDER[get(r, 'gender').toLowerCase()] || '',
      notes: get(r, 'notes'),
    };
  }).filter((c) => c.name);
  return { customers, format: isPicktime ? 'Picktime' : 'CSV' };
}
