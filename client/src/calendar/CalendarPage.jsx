import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LuCalendarDays, LuChevronLeft, LuChevronRight, LuCalendarPlus, LuUser, LuSettings, LuUpload } from 'react-icons/lu';
import Topbar from '../components/Topbar.jsx';
import { toast } from '../components/Toast.jsx';
import { Confirm } from '../components/Modal.jsx';
import { api } from '../api.js';
import { useApp, usePerms, navigate } from '../App.jsx';
import TimeGrid from './TimeGrid.jsx';
import MonthGrid from './MonthGrid.jsx';
import BookingForm from './BookingForm.jsx';
import BookingDetails from './BookingDetails.jsx';
import ImportBookings from './ImportBookings.jsx';
import { bookingTitle } from './BookingBlock.jsx';
import {
  DAY_SHORT, MONTH_LONG, MONTH_SHORT, addDays, addMonths, datePart, dayOfWeek, fromMin, fromYMD, longTime,
  minutesBetween, ordinal, prettyShortDate, startOfMonth, startOfWeek, timePart, todayYMD, addMinutesDT,
} from '../dates.js';

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('pb:' + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('pb:' + k, JSON.stringify(v)); } catch { /* ignore */ } },
};

function BookingSearch({ onPick }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (q.trim().length < 2) { setRes([]); return; }
    const t = setTimeout(async () => { setRes(await api.bookings({ q })); setOpen(true); }, 200);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    const on = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', on);
    return () => document.removeEventListener('mousedown', on);
  }, []);
  return (
    <div className="search-wrap" ref={ref}>
      <input placeholder="Search by Booking ID or customer" value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setOpen(true)} />
      {open && q.trim().length >= 2 && (
        <div className="search-menu">
          {res.length === 0 && <div className="cp-empty">No bookings found</div>}
          {res.slice(0, 30).map((b) => (
            <button key={b.id} className="cp-item" onClick={() => { setOpen(false); setQ(''); onPick(b); }}>
              <span><strong>{b.ref}</strong> · {bookingTitle(b)}</span>
              <span className="muted">{prettyShortDate(datePart(b.start))} {longTime(timePart(b.start))}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CalendarPage() {
  const { meta, reloadMeta } = useApp();
  const perms = usePerms();
  const { settings, team, locations } = meta;
  const [view, setView] = useState(() => store.get('view', 'week'));
  const [date, setDate] = useState(todayYMD);
  const [locationId, setLocationId] = useState(() => store.get('loc', ''));
  const [teamId, setTeamId] = useState(() => {
    const saved = store.get('team', null);
    if (saved === '' || team.some((t) => t.id === saved)) return saved;
    return team.length === 1 ? team[0].id : '';
  });
  const [bookings, setBookings] = useState([]);
  const [form, setForm] = useState(null);       // initial data for BookingForm
  const [details, setDetails] = useState(null); // booking shown in details modal
  const [pendingMove, setPendingMove] = useState(null);
  const [importing, setImporting] = useState(false);
  const pickerRef = useRef(null);

  useEffect(() => store.set('view', view), [view]);
  useEffect(() => store.set('loc', locationId), [locationId]);
  useEffect(() => store.set('team', teamId), [teamId]);

  // visible range
  const range = useMemo(() => {
    if (view === 'day') return { from: date, to: addDays(date, 1) };
    if (view === 'week') { const s = startOfWeek(date); return { from: s, to: addDays(s, 7) }; }
    const gridStart = startOfWeek(startOfMonth(date));
    const nextMonth = addMonths(date, 1);
    const weeks = Math.ceil((fromYMD(nextMonth) - fromYMD(gridStart)) / (7 * 864e5));
    return { from: gridStart, to: addDays(gridStart, weeks * 7), weeks };
  }, [view, date]);

  const load = useCallback(async () => {
    try {
      setBookings(await api.bookings({
        from: `${range.from} 00:00`, to: `${range.to} 00:00`,
        team_member_id: teamId || undefined, location_id: locationId || undefined,
      }));
    } catch (e) { toast(e.message, 'error'); }
  }, [range.from, range.to, teamId, locationId]);
  useEffect(() => { load(); }, [load]);

  const step = (dir) => {
    if (view === 'day') setDate(addDays(date, dir));
    else if (view === 'week') setDate(addDays(date, 7 * dir));
    else setDate(addMonths(date, dir));
  };

  const rangeLabel = (() => {
    const d = fromYMD(date);
    if (view === 'day') return `${DAY_SHORT[d.getDay()]}, ${MONTH_SHORT[d.getMonth()]} ${ordinal(d.getDate())}, ${d.getFullYear()}`;
    if (view === 'month') return `${MONTH_LONG[d.getMonth()]} ${d.getFullYear()}`;
    const s = fromYMD(range.from), e = fromYMD(addDays(range.from, 6));
    return s.getMonth() === e.getMonth()
      ? `${ordinal(s.getDate())} - ${MONTH_SHORT[e.getMonth()]} ${ordinal(e.getDate())}, ${e.getFullYear()}`
      : `${MONTH_SHORT[s.getMonth()]} ${ordinal(s.getDate())} - ${MONTH_SHORT[e.getMonth()]} ${ordinal(e.getDate())}, ${e.getFullYear()}`;
  })();

  const closedDay = (ymd) => !settings.openDays.includes(dayOfWeek(ymd));
  const selectedMember = team.find((t) => t.id === teamId);

  // ---- columns + headers for the time grid
  let columns = [], headerRows = [];
  if (view === 'week') {
    const days = Array.from({ length: 7 }, (_, i) => addDays(range.from, i));
    columns = days.map((d) => ({ key: d, date: d, teamId: teamId || null, closed: closedDay(d) }));
    headerRows = [
      [<div key="m" className="tg-member" style={{ gridColumn: `span ${days.length}` }}>
        <LuUser /> {selectedMember ? selectedMember.name : 'All Team Members'}
      </div>],
      days.map((d) => {
        const dt = fromYMD(d);
        return <button key={d} className={`tg-day ${d === todayYMD() ? 'is-today' : ''}`}
          onClick={() => { setDate(d); setView('day'); }}>
          <span className="tg-dow">{DAY_SHORT[dt.getDay()]}</span><span className="tg-num">{dt.getDate()}</span>
        </button>;
      }),
    ];
  } else if (view === 'day') {
    const members = teamId ? team.filter((t) => t.id === teamId) : team;
    columns = members.map((t) => ({ key: `${date}-${t.id}`, date, teamId: t.id, closed: closedDay(date) }));
    const dt = fromYMD(date);
    headerRows = [
      [<div key="d" className="tg-member" style={{ gridColumn: `span ${members.length}` }}>
        {DAY_SHORT[dt.getDay()]} {ordinal(dt.getDate())} {MONTH_SHORT[dt.getMonth()]}
      </div>],
      members.map((t) => (
        <div key={t.id} className="tg-day"><span className="dot" style={{ background: t.color }} /> {t.name}</div>
      )),
    ];
  }

  // ---- interactions
  const openNew = (init = {}) => perms.canCreate && setForm({
    date: init.date || (view === 'month' ? date : (date < range.from || date >= range.to ? range.from : date)),
    time: init.time || '',
    team_member_id: perms.isAdmin ? (init.team_member_id || teamId || team[0]?.id) : perms.ownTeamMemberId,
    location_id: locationId || locations[0]?.id,
  });

  const doMove = async (b, patch, allowOverlap = false) => {
    try {
      await api.updateBooking(b.id, { ...patch, allowOverlap });
      toast('Booking moved');
      load();
    } catch (e) {
      if (e.status === 409) setPendingMove({ b, patch, overlaps: e.data.overlaps });
      else toast(e.message, 'error');
    }
  };
  const onMove = (id, col, minutes) => {
    const b = bookings.find((x) => x.id === id);
    if (!b || !perms.canEdit(b)) return;
    const start = `${col.date} ${fromMin(minutes)}`;
    const patch = { start, end: addMinutesDT(start, minutesBetween(b.start, b.end)) };
    if (perms.isAdmin && col.teamId && col.teamId !== b.team_member_id) patch.team_member_id = col.teamId;
    if (patch.start === b.start && !patch.team_member_id) return;
    doMove(b, patch);
  };

  return (
    <div className="page calendar-page">
      <Topbar icon={LuCalendarDays} title="Calendar" search={<BookingSearch onPick={setDetails} />} />

      <div className="cal-toolbar">
        <div className="tb-left">
          <select className="pill-select" value={locationId} onChange={(e) => setLocationId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">All Locations</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select className="pill-select" value={teamId} onChange={(e) => setTeamId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">All Team Members</option>
            {team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        <div className="date-nav">
          <button onClick={() => step(-1)} aria-label="Previous"><LuChevronLeft /></button>
          <button className="date-label" onClick={() => setDate(todayYMD())} title="Go to today">{rangeLabel}</button>
          <button onClick={() => step(1)} aria-label="Next"><LuChevronRight /></button>
        </div>

        <div className="tb-right">
          <div className="seg">
            {[['week', 'Weekly'], ['day', 'Daily'], ['month', 'Monthly']].map(([k, l]) => (
              <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>
            ))}
          </div>
          <label className="icon-btn picker-btn" title="Jump to date">
            <LuCalendarPlus />
            <input ref={pickerRef} type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)}
              onClick={(e) => { try { e.currentTarget.showPicker(); } catch { /* older browsers */ } }} />
          </label>
          {perms.canCreate && <button className="btn btn-primary btn-new" onClick={() => openNew()}>+New</button>}
          {perms.isAdmin && <button className="icon-btn" onClick={() => setImporting(true)} title="Import bookings (Picktime export)"><LuUpload /></button>}
          {perms.isAdmin && <button className="icon-btn" onClick={() => navigate('/setup')} title="Calendar settings"><LuSettings /></button>}
        </div>
      </div>

      <div className="cal-body">
        {view === 'month' ? (
          <MonthGrid gridStart={range.from} weeks={range.weeks} month={fromYMD(date).getMonth()}
            bookings={bookings} settings={settings}
            onDayClick={(d) => { setDate(d); setView('day'); }}
            onSlotClick={(d) => openNew({ date: d })}
            onBookingClick={setDetails} />
        ) : (
          <TimeGrid columns={columns} headerRows={headerRows} bookings={bookings} settings={settings}
            onSlotClick={(col, m) => openNew({ date: col.date, time: fromMin(m), team_member_id: col.teamId })}
            onBookingClick={setDetails} onMove={onMove} canDrag={perms.canEdit} />
        )}
      </div>

      {details && (
        <BookingDetails booking={details} onClose={() => setDetails(null)}
          onEdit={(b) => { setDetails(null); setForm(b); }}
          onChanged={(nb) => { setDetails(nb); load(); }} />
      )}
      {form && (
        <BookingForm initial={form} onClose={() => setForm(null)}
          onSaved={(res) => {
            setForm(null);
            const first = Array.isArray(res) ? res[0] : res;
            if (first && (first.start < `${range.from} 00:00` || first.start >= `${range.to} 00:00`)) setDate(datePart(first.start));
            load();
          }} />
      )}
      {importing && <ImportBookings onClose={() => setImporting(false)} onDone={() => { reloadMeta(); load(); }} />}
      {pendingMove && (
        <Confirm title="Time overlap" confirmLabel="Move anyway"
          message={`The new time overlaps ${pendingMove.overlaps.length} other booking(s). Move it anyway?`}
          onClose={() => setPendingMove(null)}
          onConfirm={() => { const p = pendingMove; setPendingMove(null); doMove(p.b, p.patch, true); }} />
      )}
    </div>
  );
}
