import { useEffect, useState } from 'react';
import { LuUsers, LuUser } from 'react-icons/lu';
import CustomerFields, { FIELDS, socialUrl } from '../components/CustomerFields.jsx';
import Topbar from '../components/Topbar.jsx';
import { Confirm } from '../components/Modal.jsx';
import { toast } from '../components/Toast.jsx';
import { api } from '../api.js';
import { navigate } from '../App.jsx';
import BookingForm from '../calendar/BookingForm.jsx';
import BookingDetails from '../calendar/BookingDetails.jsx';
import { STATUS } from '../calendar/BookingBlock.jsx';
import { bookedOn, datePart, longTime, prettyShortDate, timePart, todayYMD } from '../dates.js';

const TABS = [['details', 'DETAILS'], ['address', 'ADDRESS'], ['notes', 'NOTES'], ['history', 'BOOKING HISTORY']];
export default function CustomerDetails({ id }) {
  const [c, setC] = useState(null);
  const [f, setF] = useState(null);
  const [tab, setTab] = useState('details');
  const [confirmDel, setConfirmDel] = useState(false);
  const [form, setForm] = useState(null);
  const [details, setDetails] = useState(null);

  const load = async () => {
    try {
      const data = await api.customer(id);
      setC(data);
      setF(Object.fromEntries(FIELDS.map((k) => [k, data[k] || ''])));
    } catch (e) { toast(e.message, 'error'); navigate('/customers'); }
  };
  useEffect(() => { load(); }, [id]); // eslint-disable-line

  if (!c || !f) return <div className="page"><Topbar icon={LuUsers} crumb="Customers" title="Customer Details" /><div className="empty">Loading…</div></div>;

  const dirty = FIELDS.some((k) => (c[k] || '') !== f[k]);

  const save = async () => {
    if (!f.name.trim()) return toast('Customer name is required', 'error');
    try { await api.updateCustomer(id, f); toast('Customer saved'); load(); } catch (e) { toast(e.message, 'error'); }
  };
  const remove = async () => {
    await api.deleteCustomer(id); toast('Customer deleted'); navigate('/customers');
  };

  const today = todayYMD();
  const upcoming = c.bookings.filter((b) => datePart(b.start) >= today && b.status !== 'cancelled').length;

  return (
    <div className="page">
      <Topbar icon={LuUsers} crumb={<a href="#/customers">Customers</a>} title="Customer Details" />
      <div className="subtabs">
        {TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      <div className="cust-layout">
        <section className="cust-main">
          {tab !== 'history' && <CustomerFields f={f} setF={setF} tab={tab} />}
          {tab === 'history' && (
            <div className="history">
              <div className="row-between"><strong>{c.bookings.length} booking(s)</strong>
                <button className="btn btn-primary" onClick={() => setForm({ date: today, customer: c })}>+ New booking</button></div>
              {c.bookings.length === 0 && <div className="empty">No bookings yet.</div>}
              <table className="table compact">
                <tbody>
                  {c.bookings.map((b) => (
                    <tr key={b.id} onClick={() => setDetails(b)}>
                      <td>{prettyShortDate(datePart(b.start))}<div className="muted">{longTime(timePart(b.start))}</div></td>
                      <td>{b.service_name}<div className="muted">{b.team_member_name}</div></td>
                      <td className="booked-cell"><span className="hide-sm">{b.ref}</span><div className="muted">Booked {bookedOn(b.created_at)}{b.created_by ? ` by ${b.created_by}` : ''}</div></td>
                      <td><span className={`badge st-${b.status}`}>{STATUS[b.status].label}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {tab !== 'history' && (
            <div className={`save-bar ${dirty ? 'show' : ''}`}>
              <span>You have unsaved changes</span>
              <button className="btn" onClick={() => setF(Object.fromEntries(FIELDS.map((k) => [k, c[k] || ''])))}>Discard</button>
              <button className="btn btn-primary" onClick={save}>Save</button>
            </div>
          )}
        </section>

        <aside className="cust-card">
          <div className="cust-banner">
            <div className="big-avatar"><LuUser /></div>
            <div className="cust-name">{c.name}</div>
          </div>
          <div className="cust-info">
            {c.phone && <><div className="lbl">Mobile Number</div><div>{c.phone}</div></>}
            {c.email && <><div className="lbl">Email</div><div>{c.email}</div></>}
            {c.instagram && <><div className="lbl">Instagram</div><a className="link" href={socialUrl('instagram', c.instagram)} target="_blank" rel="noreferrer">{c.instagram}</a></>}
            {c.facebook && <><div className="lbl">Facebook</div><a className="link" href={socialUrl('facebook', c.facebook)} target="_blank" rel="noreferrer">{c.facebook}</a></>}
            <div className="lbl">Bookings</div><div>{c.bookings.length} total · {upcoming} upcoming</div>
            <div className="lbl">Customer since</div><div>{prettyShortDate(c.created_at.slice(0, 10))}</div>
          </div>
          <div className="cust-btns">
            <button className="btn btn-primary" onClick={() => setForm({ date: today, customer: c })}>Book appointment</button>
            <button className="btn btn-danger" onClick={() => setConfirmDel(true)}>Delete Customer</button>
          </div>
        </aside>
      </div>

      {confirmDel && <Confirm title="Delete customer" danger confirmLabel="Delete"
        message={`Delete ${c.name}? Their bookings stay in the calendar without a customer name.`}
        onClose={() => setConfirmDel(false)} onConfirm={remove} />}
      {form && <BookingForm initial={form} onClose={() => setForm(null)} onSaved={() => { setForm(null); load(); }} />}
      {details && <BookingDetails booking={details} onClose={() => setDetails(null)}
        onEdit={(b) => { setDetails(null); setForm(b); }} onChanged={(nb) => { setDetails(nb); load(); }} />}
    </div>
  );
}
