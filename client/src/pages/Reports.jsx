import { useCallback, useEffect, useState } from 'react';
import { LuFileText, LuDownload, LuArrowRight } from 'react-icons/lu';
import Topbar from '../components/Topbar.jsx';
import { toast } from '../components/Toast.jsx';
import { api } from '../api.js';
import BookingDetails from '../calendar/BookingDetails.jsx';
import BookingForm from '../calendar/BookingForm.jsx';
import { addDays, todayYMD, DAY_LONG, MONTH_LONG } from '../dates.js';
import { csvCell } from '../csv.js';

const ACTIONS = {
  created: 'Created', moved: 'Moved', status: 'Status changed', edited: 'Edited',
  deleted: 'Deleted', photo_added: 'Photo added', photo_removed: 'Photo removed',
  note_added: 'Artist note added', note_edited: 'Artist note edited', note_removed: 'Artist note deleted',
};
const PERIODS = [['today', 'Today'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['all', 'All time']];
const PAGE = 100;

// `at` is stored in UTC ("YYYY-MM-DD HH:MM:SS"); show it in the viewer's local time
const toLocal = (at) => new Date(at.replace(' ', 'T') + 'Z');
const utcBound = (ymd) => { const d = new Date(`${ymd}T00:00:00`); return d.toISOString().slice(0, 19).replace('T', ' '); };
const pad = (n) => String(n).padStart(2, '0');
const localYMD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayTitle = (d) => `${DAY_LONG[d.getDay()]} ${d.getDate()} ${MONTH_LONG[d.getMonth()]} ${d.getFullYear()}`;

function Change({ c }) {
  if (!c.from) return <div className="ch"><span className="ch-l">{c.label}</span><span>{c.to}</span></div>;
  if (!c.to) return <div className="ch"><span className="ch-l">{c.label}</span><span className="ch-old">{c.from}</span></div>;
  return (
    <div className="ch"><span className="ch-l">{c.label}</span>
      <span className="ch-old">{c.from}</span><LuArrowRight className="ch-arrow" /><span className="ch-new">{c.to}</span>
    </div>
  );
}

export default function Reports() {
  const [period, setPeriod] = useState('30');
  const [userId, setUserId] = useState('');
  const [action, setAction] = useState('');
  const [q, setQ] = useState('');
  const [items, setItems] = useState(null);
  const [more, setMore] = useState(false);
  const [users, setUsers] = useState([]);
  const [details, setDetails] = useState(null);
  const [form, setForm] = useState(null);

  useEffect(() => { api.users().then(setUsers).catch(() => {}); }, []);

  const params = useCallback((offset = 0) => {
    const today = todayYMD();
    const from = period === 'all' ? undefined : utcBound(period === 'today' ? today : addDays(today, -Number(period) + 1));
    return { from, user_id: userId, action, q: q.trim(), limit: PAGE, offset };
  }, [period, userId, action, q]);

  const load = useCallback(async () => {
    try { const r = await api.activity(params()); setItems(r.items); setMore(r.more); } catch (e) { toast(e.message, 'error'); }
  }, [params]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  const loadMore = async () => {
    const r = await api.activity(params(items.length));
    setItems([...items, ...r.items]); setMore(r.more);
  };

  const open = async (e) => {
    if (!e.booking_id || e.action === 'deleted') return;
    try { setDetails(await api.booking(e.booking_id)); } catch { toast('This booking has been deleted since', 'error'); }
  };

  const exportCsv = async () => {
    const all = []; let offset = 0; let r;
    do { r = await api.activity({ ...params(offset), limit: 1000 }); all.push(...r.items); offset += 1000; } while (r.more);
    const cell = csvCell;
    const rows = [['Date', 'Time', 'By', 'Action', 'Booking ID', 'Customer / Title', 'Artist', 'Changes'],
      ...all.map((e) => {
        const d = toLocal(e.at);
        return [localYMD(d), `${pad(d.getHours())}:${pad(d.getMinutes())}`, e.user_name, ACTIONS[e.action] || e.action, e.booking_ref,
          e.subject, e.team_member_name, e.changes.map((c) => `${c.label}: ${c.from}${c.from && c.to ? ' -> ' : ''}${c.to}`).join(' | ')];
      })];
    const blob = new Blob(['﻿' + rows.map((r2) => r2.map(cell).join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `calendar-changes-${todayYMD()}.csv`; a.click();
    URL.revokeObjectURL(a.href);
  };

  // group entries by local day
  const groups = [];
  for (const e of items || []) {
    const d = toLocal(e.at), key = localYMD(d);
    if (groups.at(-1)?.key !== key) groups.push({ key, title: dayTitle(d), list: [] });
    groups.at(-1).list.push({ ...e, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` });
  }

  return (
    <div className="page">
      <Topbar icon={LuFileText} title="Reports"
        search={<input placeholder="Search customer, booking ID, artist…" value={q} onChange={(e) => setQ(e.target.value)} />} />
      <div className="page-actions report-filters">
        <span className="muted">Every change made in the calendar: who, when and what.</span>
        <div className="seg">
          {PERIODS.map(([k, l]) => <button key={k} className={period === k ? 'on' : ''} onClick={() => setPeriod(k)}>{l}</button>)}
        </div>
        <select className="pill-select" value={userId} onChange={(e) => setUserId(e.target.value)}>
          <option value="">Everyone</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select className="pill-select" value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">All changes</option>
          {Object.entries(ACTIONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <button className="btn" onClick={exportCsv}><LuDownload /> Export</button>
      </div>

      <div className="report">
        {items === null && <div className="empty">Loading…</div>}
        {items?.length === 0 && <div className="empty">No calendar changes for this period yet. Changes are recorded from now on.</div>}
        {groups.map((g) => (
          <section key={g.key} className="report-day">
            <h3>{g.title}</h3>
            <ul>
              {g.list.map((e) => (
                <li key={e.id} className={`report-row ${e.booking_id && e.action !== 'deleted' ? 'clickable' : ''}`} onClick={() => open(e)}>
                  <span className="r-time">{e.time}</span>
                  <div className="r-main">
                    <div className="r-head">
                      <span className={`act act-${e.action}`}>{ACTIONS[e.action] || e.action}</span>
                      <strong>{e.subject}</strong>
                      {e.booking_ref && <span className="muted">#{e.booking_ref}</span>}
                      {e.team_member_name && <span className="muted">· {e.team_member_name}</span>}
                      <span className="r-by">by {e.user_name || 'someone'}</span>
                    </div>
                    {e.changes.length > 0 && <div className="r-changes">{e.changes.map((c, i) => <Change key={i} c={c} />)}</div>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {more && <div className="report-more"><button className="btn" onClick={loadMore}>Load more</button></div>}
      </div>

      {details && <BookingDetails booking={details} onClose={() => setDetails(null)}
        onEdit={(b) => { setDetails(null); setForm(b); }} onChanged={(nb) => { setDetails(nb); load(); }} />}
      {form && <BookingForm initial={form} onClose={() => setForm(null)} onSaved={() => { setForm(null); load(); }} />}
    </div>
  );
}
