import { useEffect, useState } from 'react';
import { LuExternalLink } from 'react-icons/lu';
import Modal from './Modal.jsx';
import { toast } from './Toast.jsx';
import CustomerFields, { FIELDS, customerForm, emptyCustomer, socialUrl } from './CustomerFields.jsx';
import { api } from '../api.js';
import { STATUS } from '../calendar/BookingBlock.jsx';
import { bookedOn, datePart, longTime, prettyShortDate, timePart } from '../dates.js';

/**
 * Customer popup that opens on top of whatever is on screen (e.g. an appointment).
 * id: existing customer to view/edit; without id it creates a new one (initialName pre-fills the name).
 * onSaved(customer) is called after a successful save.
 */
export default function CustomerModal({ id, initialName = '', onClose, onSaved }) {
  const isNew = !id;
  const [c, setC] = useState(null);
  const [f, setF] = useState(isNew ? emptyCustomer(initialName) : null);
  const [tab, setTab] = useState('details');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew) return;
    api.customer(id).then((data) => { setC(data); setF(customerForm(data)); })
      .catch((e) => { toast(e.message, 'error'); onClose(); });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = isNew || (c && f && FIELDS.some((k) => (c[k] || '') !== f[k]));
  const save = async () => {
    if (!f.name.trim()) return toast('Customer name is required', 'error');
    setSaving(true);
    try {
      const saved = isNew ? await api.createCustomer(f) : await api.updateCustomer(id, f);
      toast(isNew ? 'Customer added' : 'Customer saved');
      onSaved?.(saved);
      if (isNew) onClose(); else { setC({ ...c, ...saved }); setF(customerForm(saved)); }
    } catch (e) { toast(e.message, 'error'); }
    setSaving(false);
  };

  const tabs = [['details', 'DETAILS'], ['address', 'ADDRESS'], ['notes', 'NOTES'], ...(isNew ? [] : [['history', 'BOOKING HISTORY']])];

  return (
    <Modal title={isNew ? 'Add Customer' : (c?.name || 'Customer')} onClose={onClose} width={720}
      actions={<>
        {!isNew && <a className="btn" href={`#/customers/${id}`} onClick={onClose} title="Open the full customer page"><LuExternalLink /> Full page</a>}
        <button className="btn btn-primary" disabled={saving || !dirty} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
      </>}>
      {!f ? <div className="empty">Loading…</div> : <>
        {c && (c.instagram || c.facebook || c.phone) && (
          <div className="cm-summary">
            {c.phone && <a className="link" href={`tel:${c.phone.replace(/\s/g, '')}`}>{c.phone}</a>}
            {c.instagram && <a className="link" href={socialUrl('instagram', c.instagram)} target="_blank" rel="noreferrer">Instagram: {c.instagram}</a>}
            {c.facebook && <a className="link" href={socialUrl('facebook', c.facebook)} target="_blank" rel="noreferrer">Facebook: {c.facebook}</a>}
          </div>
        )}
        <div className="subtabs cm-tabs">
          {tabs.map(([k, l]) => <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
        </div>
        {tab === 'history' ? (
          <div className="history">
            {c.bookings.length === 0 && <div className="empty">No bookings yet.</div>}
            <table className="table compact">
              <tbody>
                {c.bookings.map((b) => (
                  <tr key={b.id} className="no-hover">
                    <td>{prettyShortDate(datePart(b.start))}<div className="muted">{longTime(timePart(b.start))}</div></td>
                    <td>{b.service_name}<div className="muted">{b.team_member_name}</div></td>
                    <td className="booked-cell"><span className="hide-sm">{b.ref}</span><div className="muted">Booked {bookedOn(b.created_at)}{b.created_by ? ` by ${b.created_by}` : ''}</div></td>
                    <td><span className={`badge st-${b.status}`}>{STATUS[b.status].label}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <CustomerFields f={f} setF={setF} tab={tab} autoFocus={isNew} />}
      </>}
    </Modal>
  );
}
