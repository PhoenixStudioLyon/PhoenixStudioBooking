import { useEffect, useState } from 'react';
import { LuSettings, LuCopy, LuWandSparkles } from 'react-icons/lu';
import Topbar from '../components/Topbar.jsx';
import { toast } from '../components/Toast.jsx';
import Modal, { Confirm } from '../components/Modal.jsx';
import { api } from '../api.js';
import { useApp } from '../App.jsx';
import { DAY_LONG, fromMin, longTime } from '../dates.js';

const HOURS = Array.from({ length: 48 }, (_, i) => fromMin(i * 30));
const EMPTY_LOGIN = { name: '', email: '', password: '', is_admin: false, is_artist: true, team_member_id: '' };

// Random, easy-to-read password (no 0/O, 1/l/I) like "Kp7m-3xwR-q9Tz"
function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint32Array(12));
  const s = Array.from(bytes, (n) => chars[n % chars.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied'); } catch { toast('Select the text and copy it manually', 'error'); }
}

// Password input with a "Generate" button. A generated password is shown in clear so it can be copied.
function PasswordField({ label, value, onChange }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="field span-2"><span className="lbl">{label}</span>
      <div className="row-gap">
        <input className="input grow" type={shown ? 'text' : 'password'} autoComplete="new-password" value={value}
          onChange={(e) => { setShown(false); onChange(e.target.value); }} />
        {shown && value && <button type="button" className="btn" onClick={() => copyText(value)}><LuCopy /> Copy</button>}
        <button type="button" className="btn" onClick={() => { onChange(generatePassword()); setShown(true); }}><LuWandSparkles /> Generate</button>
      </div>
    </div>
  );
}

// Role checkboxes + "which artist" picker, shared by the add and edit forms
function RoleFields({ v, onChange, team }) {
  return <>
    <div className="field span-2"><span className="lbl">Role</span>
      <div className="role-checks">
        <label><input type="checkbox" checked={v.is_admin} onChange={(e) => onChange({ ...v, is_admin: e.target.checked })} />
          <span><strong>Admin</strong> <span className="muted">· manages all clients, calendars and settings</span></span></label>
        <label><input type="checkbox" checked={v.is_artist} onChange={(e) => onChange({ ...v, is_artist: e.target.checked })} />
          <span><strong>Tattoo artist</strong> <span className="muted">· manages their own appointments</span></span></label>
      </div>
      {v.is_artist && !v.is_admin && <span className="muted">Artists see client names as "Damien ***", without phone, email or socials.</span>}
    </div>
    {v.is_artist && (
      <label className="field span-2"><span className="lbl">Artist in the calendar</span>
        <select className="input" value={v.team_member_id || ''} onChange={(e) => onChange({ ...v, team_member_id: e.target.value ? Number(e.target.value) : '' })}>
          <option value="">Choose a team member…</option>
          {team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select></label>
    )}
  </>;
}

function RolePills({ u }) {
  return <>
    {u.is_admin ? <span className="role-pill admin">Admin</span> : null}
    {u.is_artist ? <span className="role-pill"><span className="dot" style={{ background: u.team_member_color || 'var(--accent)' }} />
      Tattoo artist{u.team_member_name ? ` · ${u.team_member_name}` : ''}</span> : null}
  </>;
}

export default function Setup() {
  const { meta, reloadMeta, user } = useApp();
  const [s, setS] = useState(meta.settings);
  const [loc, setLoc] = useState(meta.locations[0]?.name || '');
  const [users, setUsers] = useState([]);
  const [nu, setNu] = useState(EMPTY_LOGIN);
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [newPassword, setNewPassword] = useState(null); // shown once after saving
  const [pw, setPw] = useState({ current: '', next: '' });

  useEffect(() => { if (user.is_admin) api.users().then(setUsers).catch(() => {}); }, [user.is_admin]);
  const set = (k) => (e) => setS({ ...s, [k]: e.target.value });
  const toggleDay = (d) => setS({ ...s, openDays: s.openDays.includes(d) ? s.openDays.filter((x) => x !== d) : [...s.openDays, d].sort() });

  const saveBusiness = async () => {
    if (s.dayEnd <= s.dayStart) return toast('Closing time must be after opening time', 'error');
    try {
      await api.saveSettings({ businessName: s.businessName, currency: s.currency, timezone: s.timezone, dayStart: s.dayStart, dayEnd: s.dayEnd, openDays: s.openDays, colorBy: s.colorBy });
      if (meta.locations[0] && loc.trim() && loc !== meta.locations[0].name) {
        await api.updateLocation(meta.locations[0].id, { name: loc.trim() });
      }
      await reloadMeta(); toast('Settings saved');
    } catch (e) { toast(e.message, 'error'); }
  };
  const addUser = async () => {
    try {
      await api.createUser(nu);
      toast('Login created'); setNu(EMPTY_LOGIN);
      setNewPassword({ name: nu.name, email: nu.email.trim().toLowerCase(), password: nu.password });
      setUsers(await api.users());
    } catch (e) { toast(e.message, 'error'); }
  };
  const saveUser = async () => {
    try {
      const { id, name, email, password, is_admin, is_artist, team_member_id } = editing;
      await api.updateUser(id, { name, email, is_admin, is_artist, team_member_id, ...(password ? { password } : {}) });
      toast('Login saved'); setEditing(null);
      if (password) setNewPassword({ name, email, password });
      setUsers(await api.users());
    } catch (e) { toast(e.message, 'error'); }
  };
  const deleteUser = async (u) => {
    try { await api.deleteUser(u.id); toast('Login deleted'); setUsers(await api.users()); } catch (e) { toast(e.message, 'error'); }
  };
  const changePw = async () => {
    try { await api.changePassword(pw); toast('Password changed'); setPw({ current: '', next: '' }); } catch (e) { toast(e.message, 'error'); }
  };

  const passwordCard = (
    <section className="card">
      <h3>Change my password</h3>
      <p className="muted">Logged in as {user.name} ({user.email}).</p>
      <div className="form-grid">
        <label className="field"><span className="lbl">Current password</span><input className="input" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></label>
        <label className="field"><span className="lbl">New password</span><input className="input" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></label>
      </div>
      <div className="card-foot"><button className="btn" onClick={changePw}>Change password</button></div>
    </section>
  );

  if (!user.is_admin) {
    return (
      <div className="page">
        <Topbar icon={LuSettings} title="My account" />
        <div className="setup">{passwordCard}</div>
      </div>
    );
  }

  return (
    <div className="page">
      <Topbar icon={LuSettings} title="Setup" />
      <div className="setup">
        <section className="card">
          <h3>Business</h3>
          <div className="form-grid">
            <label className="field"><span className="lbl">Business name</span><input className="input" value={s.businessName} onChange={set('businessName')} /></label>
            <label className="field"><span className="lbl">Location name</span><input className="input" value={loc} onChange={(e) => setLoc(e.target.value)} /></label>
            <label className="field"><span className="lbl">Currency symbol</span><input className="input" value={s.currency} onChange={set('currency')} /></label>
            <label className="field"><span className="lbl">Timezone</span><input className="input" value={s.timezone} onChange={set('timezone')} /></label>
            <label className="field"><span className="lbl">Opens at</span>
              <select className="input" value={s.dayStart} onChange={set('dayStart')}>{HOURS.map((h) => <option key={h} value={h}>{longTime(h)}</option>)}</select></label>
            <label className="field"><span className="lbl">Closes at</span>
              <select className="input" value={s.dayEnd} onChange={set('dayEnd')}>{[...HOURS.slice(1), '23:59'].map((h) => <option key={h} value={h}>{longTime(h)}</option>)}</select></label>
            <label className="field span-2"><span className="lbl">Appointment colours in the calendar</span>
              <select className="input" value={s.colorBy || 'service'} onChange={set('colorBy')}>
                <option value="service">By booking type (artist colour when the type has none)</option>
                <option value="artist">By artist</option>
              </select></label>
            <div className="field span-2"><span className="lbl">Open days</span>
              <div className="day-chips">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <button key={d} type="button" className={`chip ${s.openDays.includes(d) ? 'on' : ''}`} onClick={() => toggleDay(d)}>{DAY_LONG[d].slice(0, 3)}</button>
                ))}
              </div></div>
          </div>
          <div className="card-foot"><button className="btn btn-primary" onClick={saveBusiness}>Save settings</button></div>
        </section>

        <section className="card">
          <h3>Logins</h3>
          <p className="muted">People who can log in. Admins manage everything; tattoo artists manage only their own appointments.</p>
          <ul className="login-list">
            {users.map((u) => (
              <li key={u.id} className="login-row">
                <div className="who"><strong>{u.name}{u.id === user.id ? ' (you)' : ''}</strong><span className="muted">{u.email}</span></div>
                <div className="row-gap"><RolePills u={u} /></div>
                <div className="row-gap">
                  <button className="btn" onClick={() => setEditing({ ...u, is_admin: !!u.is_admin, is_artist: !!u.is_artist, team_member_id: u.team_member_id || '', password: '' })}>Edit</button>
                  {u.id !== user.id && <button className="btn" onClick={() => setRemoving(u)}>Delete</button>}
                </div>
              </li>
            ))}
          </ul>
          <h3 className="mt">Add a login</h3>
          <div className="form-grid">
            <label className="field"><span className="lbl">Name</span><input className="input" value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} /></label>
            <label className="field"><span className="lbl">Email or ID</span><input className="input" type="text" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} /></label>
            <PasswordField label="Temporary password (8+ characters)" value={nu.password} onChange={(password) => setNu({ ...nu, password })} />
            <RoleFields v={nu} onChange={setNu} team={meta.team} />
          </div>
          <div className="card-foot"><button className="btn btn-primary" onClick={addUser}>Add login</button></div>
        </section>

        {passwordCard}
      </div>

      {editing && (
        <Modal title="Edit login" onClose={() => setEditing(null)} width={560}
          footer={<><button className="btn" onClick={() => setEditing(null)}>Cancel</button><button className="btn btn-primary" onClick={saveUser}>Save</button></>}>
          <div className="form-grid">
            <label className="field"><span className="lbl">Name</span><input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label>
            <label className="field"><span className="lbl">Email or ID</span><input className="input" type="text" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></label>
            <RoleFields v={editing} onChange={setEditing} team={meta.team} />
            <PasswordField label="New password (leave empty to keep it)" value={editing.password} onChange={(password) => setEditing({ ...editing, password })} />
          </div>
        </Modal>
      )}
      {newPassword && (
        <Modal title="Password set" onClose={() => setNewPassword(null)} width={480}
          footer={<button className="btn btn-primary" onClick={() => setNewPassword(null)}>Done</button>}>
          <p className="confirm-msg">Send these to <strong>{newPassword.name}</strong>. For security the password isn't stored in readable form, so <strong>it won't be shown again</strong>.</p>
          <div className="pw-reveal">
            <div><span className="lbl">Email</span><span>{newPassword.email}</span></div>
            <div><span className="lbl">Password</span><code>{newPassword.password}</code></div>
          </div>
          <button className="btn" onClick={() => copyText(`Login: ${newPassword.email}\nPassword: ${newPassword.password}`)}><LuCopy /> Copy login & password</button>
          <p className="muted">They can change it later in "My account".</p>
        </Modal>
      )}
      {removing && (
        <Confirm title="Delete login" danger confirmLabel="Delete" message={`${removing.name} will no longer be able to log in. Their appointments stay in the calendar.`}
          onClose={() => setRemoving(null)} onConfirm={() => { const u = removing; setRemoving(null); deleteUser(u); }} />
      )}
    </div>
  );
}
