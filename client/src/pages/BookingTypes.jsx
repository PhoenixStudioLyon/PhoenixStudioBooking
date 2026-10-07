import { useState } from 'react';
import { LuLayoutList, LuPencil, LuTrash2 } from 'react-icons/lu';
import Topbar from '../components/Topbar.jsx';
import Modal, { Confirm } from '../components/Modal.jsx';
import { toast } from '../components/Toast.jsx';
import { api } from '../api.js';
import { useApp } from '../App.jsx';
import { durationLabel } from '../dates.js';
import ColorPicker from '../components/ColorPicker.jsx';

function ServiceForm({ svc, currency, onClose, onSaved }) {
  const [f, setF] = useState({ name: svc?.name || '', duration_min: svc?.duration_min || 60, price: svc?.price ?? 0, color: svc?.color || '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    if (!f.name.trim()) return toast('Name is required', 'error');
    const body = { name: f.name, duration_min: Number(f.duration_min), price: Number(f.price) || 0, color: f.color };
    try { svc ? await api.updateService(svc.id, body) : await api.createService(body); toast('Saved'); onSaved(); }
    catch (e) { toast(e.message, 'error'); }
  };
  return (
    <Modal title={svc ? 'Edit Booking Type' : 'Add Booking Type'} onClose={onClose} width={520}
      actions={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}>
      <div className="form-grid">
        <label className="field span-2"><span className="lbl">Name</span><input className="input" autoFocus value={f.name} onChange={set('name')} /></label>
        <label className="field"><span className="lbl">Default duration</span>
          <select className="input" value={f.duration_min} onChange={set('duration_min')}>
            {Array.from({ length: 48 }, (_, i) => (i + 1) * 15).map((d) => <option key={d} value={d}>{durationLabel(d)}</option>)}
          </select></label>
        <label className="field"><span className="lbl">Default price ({currency})</span>
          <input className="input" type="number" min="0" step="0.01" value={f.price} onChange={set('price')} /></label>
        <div className="field span-2"><span className="lbl">Calendar colour</span>
          <ColorPicker value={f.color} onChange={(color) => setF({ ...f, color })} allowNone noneLabel="No colour (use the artist's colour)" />
          <span className="muted">{f.color ? 'Appointments of this type use this colour in the calendar.' : "No colour: appointments use the artist's colour."}</span>
        </div>
      </div>
    </Modal>
  );
}

export default function BookingTypes() {
  const { meta, reloadMeta } = useApp();
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  return (
    <div className="page">
      <Topbar icon={LuLayoutList} title="Booking Types" />
      <div className="page-actions"><button className="btn btn-primary" onClick={() => setEditing('new')}>Add Booking Type</button></div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Name</th><th>Colour</th><th>Duration</th><th>Price</th><th /></tr></thead>
          <tbody>
            {meta.services.map((s) => (
              <tr key={s.id} className="no-hover">
                <td><strong>{s.name}</strong></td>
                <td>{s.color ? <span className="color-chip" style={{ background: s.color }} title={s.color} /> : <span className="muted">Artist colour</span>}</td>
                <td>{durationLabel(s.duration_min)}</td>
                <td>{meta.settings.currency} {Number(s.price).toFixed(2)}</td>
                <td className="actions">
                  <button className="icon-btn" onClick={() => setEditing(s)} aria-label="Edit"><LuPencil /></button>
                  <button className="icon-btn" onClick={() => setRemoving(s)} aria-label="Remove"><LuTrash2 /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <ServiceForm svc={editing === 'new' ? null : editing} currency={meta.settings.currency}
        onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reloadMeta(); }} />}
      {removing && <Confirm title="Remove booking type" danger confirmLabel="Remove"
        message={`Remove "${removing.name}"? Existing bookings keep it; it just won't be offered for new ones.`}
        onClose={() => setRemoving(null)}
        onConfirm={async () => { await api.deleteService(removing.id); setRemoving(null); reloadMeta(); toast('Removed'); }} />}
    </div>
  );
}
