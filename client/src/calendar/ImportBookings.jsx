import { useMemo, useState } from 'react';
import Modal from '../components/Modal.jsx';
import { toast } from '../components/Toast.jsx';
import { api } from '../api.js';
import { bookingsFromFile, looksLikeBlocker } from '../importBookings.js';
import { datePart, prettyShortDate, timePart, longTime } from '../dates.js';

// Import a Picktime bookings export (.xlsx or .csv): preview, choose which names are time blockers, import
export default function ImportBookings({ onClose, onDone }) {
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [blockerNames, setBlockerNames] = useState(new Set());
  const [result, setResult] = useState(null);

  const pick = async (file) => {
    setError(''); setParsed(null); setResult(null);
    if (!file) return;
    try {
      const p = await bookingsFromFile(file);
      if (!p.bookings.length) throw new Error('No bookings found in this file');
      setParsed(p);
      setBlockerNames(new Set(p.bookings.filter((b) => looksLikeBlocker(b.name)).map((b) => b.name.toLowerCase())));
    } catch (e) { setError(e.message); }
  };

  const stats = useMemo(() => {
    if (!parsed) return null;
    const list = parsed.bookings;
    const byArtist = {}, names = {};
    for (const b of list) {
      byArtist[b.artist] = (byArtist[b.artist] || 0) + 1;
      const k = b.name.toLowerCase();
      if (looksLikeBlocker(b.name)) names[k] = { label: b.name, count: (names[k]?.count || 0) + 1 };
    }
    const starts = list.map((b) => b.start).sort();
    return { byArtist, blockers: Object.entries(names), from: datePart(starts[0]), to: datePart(starts.at(-1)) };
  }, [parsed]);

  const toggle = (k) => setBlockerNames((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const isBlocker = (b) => blockerNames.has(b.name.toLowerCase());
  const blockerCount = parsed ? parsed.bookings.filter(isBlocker).length : 0;

  const run = async () => {
    setBusy(true);
    try {
      const payload = parsed.bookings.map(({ no, name, ...b }) => (isBlocker({ name })
        ? { ...b, blocker: true, title: name, customer: undefined }
        : b));
      const r = await api.importBookings(payload);
      setResult(r);
      toast(`${r.added + r.blockers} bookings imported`);
      onDone();
    } catch (e) { toast(e.message, 'error'); }
    setBusy(false);
  };

  return (
    <Modal title="Import bookings" onClose={onClose} width={820}
      footer={result
        ? <button className="btn btn-primary" onClick={onClose}>Done</button>
        : <><button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!parsed || busy} onClick={run}>{busy ? 'Importing…' : `Import ${parsed?.bookings.length || ''} bookings`}</button></>}>
      {result ? (
        <div className="import-result">
          <p className="confirm-msg"><strong>Import finished.</strong></p>
          <ul>
            <li><strong>{result.added}</strong> appointments and <strong>{result.blockers}</strong> time blockers added</li>
            {result.skipped > 0 && <li>{result.skipped} already in the calendar (skipped)</li>}
            {result.invalid > 0 && <li>{result.invalid} ignored (invalid date or artist)</li>}
            <li>{result.customersCreated} new customers created (the others were matched by name and phone)</li>
            {result.artistsCreated.length > 0 && <li>New artists: {result.artistsCreated.join(', ')}. Set their colours in Team Members.</li>}
            {result.servicesCreated.length > 0 && <li>New booking types: {result.servicesCreated.join(', ')}</li>}
          </ul>
        </div>
      ) : <>
        <p className="confirm-msg">Choose the Picktime bookings export (<strong>.xlsx</strong> or .csv). Import your <strong>customers first</strong> so appointments attach to them. Bookings already in the calendar are skipped, so importing twice is safe.</p>
        <input className="input import-file" type="file" accept=".xlsx,.csv" onChange={(e) => pick(e.target.files[0])} />
        {error && <div className="form-error">{error}</div>}
        {parsed && stats && <>
          <div className="import-stats">
            <div><strong>{parsed.bookings.length}</strong><span>bookings, {prettyShortDate(stats.from)} → {prettyShortDate(stats.to)}</span></div>
            <div><strong>{parsed.bookings.length - blockerCount}</strong><span>appointments</span></div>
            <div><strong>{blockerCount}</strong><span>time blockers</span></div>
            <div><strong>{Object.keys(stats.byArtist).length}</strong><span>artists</span></div>
          </div>
          <p className="muted small-print">{Object.entries(stats.byArtist).map(([a, n]) => `${a} ${n}`).join(' · ')}</p>
          {parsed.problems.length > 0 && <div className="form-error">{parsed.problems.length} line(s) can't be read and will be left out: {parsed.problems.slice(0, 3).join('; ')}</div>}

          {stats.blockers.length > 0 && <>
            <div className="lbl">Imported as time blockers (no customer created) — untick to import as normal appointments</div>
            <div className="blocker-checks">
              {stats.blockers.map(([k, v]) => (
                <label key={k}><input type="checkbox" checked={blockerNames.has(k)} onChange={() => toggle(k)} /> {v.label} <span className="muted">×{v.count}</span></label>
              ))}
            </div>
          </>}

          <div className="import-preview">
            <table className="table compact">
              <thead><tr><th>Date</th><th>Artist</th><th>Customer / blocker</th><th className="hide-sm">Notes</th></tr></thead>
              <tbody>
                {parsed.bookings.slice(0, 40).map((b, i) => (
                  <tr key={i} className="no-hover">
                    <td>{prettyShortDate(datePart(b.start))}<div className="muted">{longTime(timePart(b.start))} – {longTime(timePart(b.end))}</div></td>
                    <td>{b.artist}<div className="muted">{b.service}{b.status === 'no_show' ? ' · No-show' : ''}</div></td>
                    <td>{isBlocker(b) ? <span className="act">Blocker</span> : null} {b.name || '-'}</td>
                    <td className="hide-sm import-notes">{b.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {parsed.bookings.length > 40 && <p className="muted">…and {parsed.bookings.length - 40} more</p>}
          </div>
        </>}
      </>}
    </Modal>
  );
}
