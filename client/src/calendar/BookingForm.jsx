import { useEffect, useMemo, useRef, useState } from 'react';
import { LuPlus, LuSearch, LuX, LuUserPen } from 'react-icons/lu';
import Modal, { Confirm } from '../components/Modal.jsx';
import { toast } from '../components/Toast.jsx';
import { api } from '../api.js';
import { useApp, usePerms } from '../App.jsx';
import CustomerModal from '../components/CustomerModal.jsx';
import DateField from '../components/DateField.jsx';
import { PhotoGrid, imageFiles, shrinkImage } from '../components/Photos.jsx';
import { datePart, fromMin, longTime, minutesBetween, timePart, toMin, durationLabel, addMinutesDT, prettyShortDate } from '../dates.js';

const TIME_OPTIONS = Array.from({ length: 96 }, (_, i) => fromMin(i * 15));
const DURATIONS = Array.from({ length: 48 }, (_, i) => (i + 1) * 15); // 15 min .. 12 h

function CustomerPicker({ value, onChange }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState(false);
  const box = useRef(null);
  const perms = usePerms();

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => setResults(await api.customers({ q, limit: 25 })), 150);
    return () => clearTimeout(t);
  }, [q, open]);
  useEffect(() => {
    const on = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', on);
    return () => document.removeEventListener('mousedown', on);
  }, []);

  if (value) {
    return (
      <div className="picked">
        <div><strong>{value.name}</strong><span className="muted">{[value.phone, value.email].filter(Boolean).join(' · ')}</span></div>
        <div className="row-gap">
          {perms.isAdmin && <button type="button" className="icon-btn" onClick={() => setViewing(true)} aria-label="View customer" title="View / edit customer"><LuUserPen /></button>}
          <button type="button" className="icon-btn" onClick={() => onChange(null)} aria-label="Change customer" title="Change customer"><LuX /></button>
        </div>
        {viewing && <CustomerModal id={value.id} onClose={() => setViewing(false)} onSaved={(c) => onChange(c)} />}
      </div>
    );
  }
  return (
    <div className="cust-picker" ref={box}>
      <div className="row-gap">
        <div className="input-icon grow">
          <input className="input" placeholder="Search customer..." value={q}
            onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} />
          <LuSearch />
        </div>
        <button type="button" className="btn-square" onClick={() => { setAdding(true); setOpen(false); }}
          aria-label="New customer" title="New customer"><LuPlus /></button>
      </div>
      {open && !adding && (
        <div className="cp-menu">
          {results.length === 0 && <div className="cp-empty">No customer found. Use + to add one.</div>}
          {results.map((c) => (
            <button type="button" key={c.id} className="cp-item" onClick={() => { onChange(c); setOpen(false); }}>
              <span>{c.name}</span><span className="muted">{c.phone || c.email}</span>
            </button>
          ))}
        </div>
      )}
      {adding && <CustomerModal initialName={q} onClose={() => setAdding(false)} onSaved={(c) => { onChange(c); setQ(''); }} />}
    </div>
  );
}

/**
 * initial: an existing booking (edit) or { date, time, team_member_id, type } for a new one
 */
export default function BookingForm({ initial, onClose, onSaved }) {
  const { meta } = useApp();
  const perms = usePerms();
  const editing = !!initial.id;
  const firstService = meta.services[0];

  const [type, setType] = useState(initial.type || 'appointment');
  const [customer, setCustomer] = useState(initial.customer_id
    ? { id: initial.customer_id, name: initial.customer_name, phone: initial.customer_phone, email: initial.customer_email } : initial.customer || null);
  const [f, setF] = useState(() => {
    const date = initial.start ? datePart(initial.start) : initial.date;
    const time = initial.start ? timePart(initial.start) : (initial.time || '');
    const svc = meta.services.find((s) => s.id === initial.service_id);
    return {
      location_id: initial.location_id || meta.locations[0]?.id || '',
      date,
      recurFreq: '',
      recurCount: 4,
      service_id: initial.service_id || '',
      price: initial.price ?? 0,
      team_member_id: perms.isAdmin ? (initial.team_member_id || meta.team[0]?.id || '') : perms.ownTeamMemberId,
      time,
      duration: initial.start ? minutesBetween(initial.start, initial.end) : (svc?.duration_min || ''),
      endTime: initial.end ? timePart(initial.end) : (time ? fromMin(Math.min(toMin(time) + 60, 23 * 60 + 45)) : ''),
      title: initial.title || 'Time Blocker',
      notes: initial.notes || '',
    };
  });
  const [saving, setSaving] = useState(false);
  const [overlap, setOverlap] = useState(null);
  // photos: saved ones ({ id }) and new ones waiting for upload ({ key, url, file })
  const [photos, setPhotos] = useState([]);
  const [removedPhotos, setRemovedPhotos] = useState([]);
  useEffect(() => {
    if (editing && initial.photo_count) api.bookingPhotos(initial.id).then(setPhotos).catch(() => {});
  }, [editing, initial.id, initial.photo_count]);
  const photosRef = useRef(photos);
  photosRef.current = photos;
  useEffect(() => () => photosRef.current.forEach((p) => p.url && URL.revokeObjectURL(p.url)), []);

  const addPhotos = (files) => {
    if (!files.length) return;
    setPhotos((ps) => [...ps, ...files.map((file) => ({ key: Math.random().toString(36).slice(2), url: URL.createObjectURL(file), file, name: file.name }))]);
  };
  const removePhoto = (p) => {
    setPhotos((ps) => ps.filter((x) => x !== p));
    if (p.id) setRemovedPhotos((r) => [...r, p.id]);
    if (p.url) URL.revokeObjectURL(p.url);
  };
  const pastePhotos = (e) => {
    const files = imageFiles(e.clipboardData?.files);
    if (files.length) { e.preventDefault(); addPhotos(files); }
  };

  // Applies photo changes once the booking exists. For a recurring series, photos go on the first booking.
  const savePhotos = async (bookingId) => {
    const failed = [];
    for (const id of removedPhotos) await api.deletePhoto(id).catch(() => {});
    for (const p of photos.filter((x) => x.file)) {
      try { await api.uploadPhoto(bookingId, await shrinkImage(p.file)); } catch (e) { failed.push(e.message); }
    }
    if (failed.length) toast(`${failed.length} photo${failed.length > 1 ? 's' : ''} could not be saved: ${failed[0]}`, 'error');
  };
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const durationOptions = useMemo(() => {
    const d = Number(f.duration);
    return d && !DURATIONS.includes(d) ? [...DURATIONS, d].sort((a, b) => a - b) : DURATIONS;
  }, [f.duration]);

  const pickService = (e) => {
    const id = Number(e.target.value);
    const s = meta.services.find((x) => x.id === id);
    setF((x) => ({ ...x, service_id: id || '', price: s ? s.price : x.price, duration: s ? s.duration_min : x.duration }));
  };

  const payload = () => {
    if (!f.date) throw new Error('Please choose a date');
    if (!f.time) throw new Error('Please choose a time');
    const start = `${f.date} ${f.time}`;
    let end;
    if (type === 'blocker') {
      if (!f.endTime || toMin(f.endTime) <= toMin(f.time)) throw new Error('End time must be after start time');
      end = `${f.date} ${f.endTime}`;
    } else {
      if (!customer) throw new Error('Please choose a customer');
      if (!f.service_id) throw new Error('Please choose a service');
      if (!f.duration) throw new Error('Please choose a duration');
      end = addMinutesDT(start, Number(f.duration));
    }
    return {
      type, start, end,
      customer_id: customer?.id,
      service_id: f.service_id || null,
      location_id: f.location_id || null,
      team_member_id: f.team_member_id || null,
      price: Number(f.price) || 0,
      title: f.title,
      notes: f.notes,
      recurrence: !editing && f.recurFreq ? { freq: f.recurFreq, count: Number(f.recurCount) } : undefined,
    };
  };

  const save = async (allowOverlap = false) => {
    let body;
    try { body = payload(); } catch (e) { return toast(e.message, 'error'); }
    setSaving(true);
    try {
      const res = editing ? await api.updateBooking(initial.id, { ...body, allowOverlap })
        : await api.createBooking({ ...body, allowOverlap });
      const first = Array.isArray(res) ? res[0] : res;
      await savePhotos(first.id);
      toast(editing ? 'Booking updated' : (Array.isArray(res) && res.length > 1 ? `${res.length} bookings created` : 'Booking created'));
      onSaved(res);
    } catch (e) {
      if (e.status === 409) setOverlap(e.data.overlaps || []);
      else toast(e.message, 'error');
    } finally { setSaving(false); }
  };

  return (
    <Modal title={editing ? (type === 'blocker' ? 'Edit Time Blocker' : 'Edit Booking') : 'Add Booking'} onClose={onClose}
      actions={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={saving} onClick={() => save(false)}>{saving ? 'Saving…' : 'Save'}</button>
      </>}>
      {!editing && (
        <div className="seg-tabs">
          <button className={type === 'appointment' ? 'on' : ''} onClick={() => setType('appointment')}>APPOINTMENT</button>
          <button className={type === 'blocker' ? 'on' : ''} onClick={() => setType('blocker')}>TIME BLOCKER</button>
        </div>
      )}

      <div className="form-grid">
        {type === 'appointment' ? (
          <div className="field span-2"><span className="lbl">Customer</span>
            <CustomerPicker value={customer} onChange={setCustomer} />
          </div>
        ) : (
          <label className="field span-2"><span className="lbl">Title</span>
            <input className="input" value={f.title} onChange={set('title')} placeholder="Time Blocker" />
          </label>
        )}

        <label className="field span-2"><span className="lbl">Location</span>
          <select className="input" value={f.location_id} onChange={set('location_id')}>
            {meta.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>

        <div className="field"><span className="lbl">Date</span>
          <DateField value={f.date} onChange={(date) => setF((x) => ({ ...x, date }))} />
        </div>
        {!editing ? (
          <div className="field"><span className="lbl">Recurring</span>
            <div className="row-gap">
              <select className="input grow" value={f.recurFreq} onChange={set('recurFreq')}>
                <option value="">Not Recurring</option>
                <option value="daily">Every day</option>
                <option value="weekly">Every week</option>
                <option value="biweekly">Every 2 weeks</option>
                <option value="monthly">Every month</option>
              </select>
              {f.recurFreq && (
                <select className="input w-auto" value={f.recurCount} onChange={set('recurCount')} aria-label="Occurrences">
                  {[2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 26, 52].map((n) => <option key={n} value={n}>{n} times</option>)}
                </select>
              )}
            </div>
          </div>
        ) : <div className="field"><span className="lbl">Booking ID</span><div className="static">{initial.ref}</div></div>}

        {type === 'appointment' && <>
          <label className="field"><span className="lbl">Service</span>
            <select className="input" value={f.service_id} onChange={pickService}>
              <option value="">Select Service</option>
              {meta.services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="field"><span className="lbl">Price ({meta.settings.currency})</span>
            <input className="input" type="number" min="0" step="0.01" value={f.price} onChange={set('price')} />
          </label>
        </>}

        <label className="field"><span className="lbl">Team Member</span>
          <select className="input" value={f.team_member_id} onChange={set('team_member_id')} disabled={!perms.isAdmin}>
            {meta.team.filter((t) => perms.isAdmin || t.id === perms.ownTeamMemberId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <div className="field two">
          <label><span className="lbl">{type === 'blocker' ? 'From' : 'Time'}</span>
            <select className="input" value={f.time} onChange={set('time')}>
              <option value="">Select Time</option>
              {TIME_OPTIONS.map((t) => <option key={t} value={t}>{longTime(t)}</option>)}
              {f.time && !TIME_OPTIONS.includes(f.time) && <option value={f.time}>{longTime(f.time)}</option>}
            </select>
          </label>
          {type === 'blocker' ? (
            <label><span className="lbl">To</span>
              <select className="input" value={f.endTime} onChange={set('endTime')}>
                <option value="">Select Time</option>
                {TIME_OPTIONS.map((t) => <option key={t} value={t}>{longTime(t)}</option>)}
              </select>
            </label>
          ) : (
            <label><span className="lbl">Duration</span>
              <select className="input" value={f.duration} onChange={set('duration')}>
                <option value="">Select Duration</option>
                {durationOptions.map((d) => <option key={d} value={d}>{durationLabel(d)}</option>)}
              </select>
            </label>
          )}
        </div>

        <label className="field span-2"><span className="lbl">Booking Notes</span>
          <textarea className="input" rows={4} value={f.notes} onChange={set('notes')} onPaste={pastePhotos}
            placeholder="You can also paste a picture here" />
        </label>
        <div className="field span-2" onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); addPhotos(imageFiles(e.dataTransfer.files)); }}>
          <span className="lbl">Photos</span>
          <PhotoGrid photos={photos} onRemove={removePhoto} onAdd={addPhotos} />
          {!editing && f.recurFreq && photos.length > 0 && <span className="muted photo-note">Photos are added to the first booking of the series.</span>}
        </div>
      </div>

      {overlap && (
        <Confirm title="Time overlap" confirmLabel="Save anyway" onClose={() => setOverlap(null)}
          onConfirm={() => { setOverlap(null); save(true); }}
          message={<>This overlaps with {overlap.length} other booking{overlap.length > 1 ? 's' : ''}:
            <span className="overlap-list">{overlap.slice(0, 4).map((o) => (
              <span key={o.id}>• {o.type === 'blocker' ? (o.title || 'Time Blocker') : o.customer_name} — {prettyShortDate(datePart(o.start))}, {longTime(timePart(o.start))}</span>
            ))}</span></>} />
      )}
      {!firstService && type === 'appointment' && <p className="hint">Add a service in Booking Types first.</p>}
    </Modal>
  );
}
