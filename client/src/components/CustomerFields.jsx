import { LuInstagram, LuFacebook } from 'react-icons/lu';
import { MONTH_LONG } from '../dates.js';

// Editable customer fields, shared by the customer page and the customer popup
export const FIELDS = ['name', 'phone', 'alt_phone', 'email', 'instagram', 'facebook', 'gender', 'birthday', 'address', 'city', 'postcode', 'country', 'notes'];
export const emptyCustomer = (name = '') => ({ ...Object.fromEntries(FIELDS.map((k) => [k, ''])), name });
export const customerForm = (c) => Object.fromEntries(FIELDS.map((k) => [k, c[k] || '']));

// "@damien.ink" -> instagram.com/damien.ink ; a full link is used as-is ; other Facebook text -> Facebook search
export function socialUrl(kind, v) {
  const t = v.trim();
  if (/^https?:\/\//i.test(t)) return t;
  if (/^(www\.)?(instagram|facebook|fb)\.com\//i.test(t)) return `https://${t}`;
  if (kind === 'instagram') return `https://www.instagram.com/${encodeURIComponent(t.replace(/^@/, ''))}/`;
  return /\s/.test(t) ? `https://www.facebook.com/search/people/?q=${encodeURIComponent(t)}` : `https://www.facebook.com/${encodeURIComponent(t.replace(/^@/, ''))}`;
}

// tab: 'details' | 'address' | 'notes'
export default function CustomerFields({ f, setF, tab, autoFocus }) {
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const [bY, bM, bD] = (f.birthday || '--').split('-');
  const setBirth = (part, v) => {
    const p = { y: bY || '', m: bM || '', d: bD || '', [part]: v };
    setF({ ...f, birthday: p.y || p.m || p.d ? `${p.y}-${p.m}-${p.d}` : '' });
  };
  const thisYear = new Date().getFullYear();

  if (tab === 'address') return (
    <div className="form-grid">
      <label className="field span-2"><span className="lbl">Address</span><input className="input" value={f.address} onChange={set('address')} /></label>
      <label className="field"><span className="lbl">City</span><input className="input" value={f.city} onChange={set('city')} /></label>
      <label className="field"><span className="lbl">Postcode</span><input className="input" value={f.postcode} onChange={set('postcode')} /></label>
      <label className="field span-2"><span className="lbl">Country</span><input className="input" value={f.country} onChange={set('country')} /></label>
    </div>
  );
  if (tab === 'notes') return (
    <label className="field"><span className="lbl">Notes (private, only your team sees these)</span>
      <textarea className="input" rows={10} value={f.notes} onChange={set('notes')} /></label>
  );
  return (
    <div className="form-grid">
      <label className="field span-2"><span className="lbl">Customer Name</span><input className="input" autoFocus={autoFocus} value={f.name} onChange={set('name')} /></label>
      <label className="field span-2"><span className="lbl">Mobile Number</span>
        <div className="phone"><span className="cc">FR</span><input className="input" value={f.phone} onChange={set('phone')} placeholder="+33 6 12 34 56 78" /></div></label>
      <label className="field span-2"><span className="lbl">Alternative Number</span>
        <div className="phone"><span className="cc">FR</span><input className="input" value={f.alt_phone} onChange={set('alt_phone')} placeholder="+33 6 12 34 56 78" /></div></label>
      <label className="field span-2"><span className="lbl">Email Id</span><input className="input" type="email" value={f.email} onChange={set('email')} /></label>
      <label className="field"><span className="lbl">Instagram</span>
        <div className="social-input"><LuInstagram /><input className="input" value={f.instagram} onChange={set('instagram')} placeholder="@username" /></div></label>
      <label className="field"><span className="lbl">Facebook</span>
        <div className="social-input"><LuFacebook /><input className="input" value={f.facebook} onChange={set('facebook')} placeholder="Name or profile link" /></div></label>
      <label className="field"><span className="lbl">Gender</span>
        <select className="input" value={f.gender} onChange={set('gender')}>
          <option value="" /><option>Female</option><option>Male</option><option>Other</option>
        </select></label>
      <div className="field"><span className="lbl">Birthday</span>
        <div className="row-gap">
          <select className="input" value={bM || ''} onChange={(e) => setBirth('m', e.target.value)} aria-label="Month">
            <option value="">MONTH</option>{MONTH_LONG.map((m, i) => <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
          </select>
          <select className="input" value={bD || ''} onChange={(e) => setBirth('d', e.target.value)} aria-label="Day">
            <option value="">DATE</option>{Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0')).map((d) => <option key={d}>{d}</option>)}
          </select>
          <select className="input" value={bY || ''} onChange={(e) => setBirth('y', e.target.value)} aria-label="Year">
            <option value="">YEAR</option>{Array.from({ length: 90 }, (_, i) => String(thisYear - i)).map((y) => <option key={y}>{y}</option>)}
          </select>
        </div></div>
    </div>
  );
}
