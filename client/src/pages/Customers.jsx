import { useEffect, useState } from 'react';
import { LuUsers, LuEllipsisVertical, LuUser, LuDownload, LuTrash2, LuUpload } from 'react-icons/lu';
import Topbar from '../components/Topbar.jsx';
import Modal, { Confirm } from '../components/Modal.jsx';
import CustomerModal from '../components/CustomerModal.jsx';
import Dropdown from '../components/Dropdown.jsx';
import { toast } from '../components/Toast.jsx';
import { api } from '../api.js';
import { navigate } from '../App.jsx';
import { prettyShortDate } from '../dates.js';
import { customersFromCsv } from '../importCustomers.js';

// Pick a CSV (e.g. Picktime: Customers > Export), preview it, then import
function ImportCustomers({ onClose, onDone }) {
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pick = async (file) => {
    setError(''); setParsed(null);
    if (!file) return;
    try { setParsed({ file: file.name, ...customersFromCsv(await file.text()) }); } catch (e) { setError(e.message); }
  };
  const run = async () => {
    setBusy(true);
    try {
      const r = await api.importCustomers(parsed.customers);
      toast(`${r.added} customer(s) imported${r.skipped ? `, ${r.skipped} already existed` : ''}`);
      onDone(); onClose();
    } catch (e) { toast(e.message, 'error'); setBusy(false); }
  };
  const list = parsed?.customers || [];
  const count = (k) => list.filter((c) => c[k]).length;
  return (
    <Modal title="Import customers" onClose={onClose} width={760}
      footer={<><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!list.length || busy} onClick={run}>{busy ? 'Importing…' : `Import ${list.length || ''} customers`}</button></>}>
      <p className="confirm-msg">Choose a CSV file, for example the Picktime export (<em>Customers → Export</em>). Customers already here with the same name and phone are skipped, so importing the same file twice is safe.</p>
      <input className="input import-file" type="file" accept=".csv,text/csv" onChange={(e) => pick(e.target.files[0])} />
      {error && <div className="form-error">{error}</div>}
      {parsed && <>
        <div className="import-stats">
          <div><strong>{list.length}</strong><span>customers ({parsed.format})</span></div>
          <div><strong>{count('phone')}</strong><span>with phone</span></div>
          <div><strong>{count('email')}</strong><span>with email</span></div>
          <div><strong>{count('instagram')}</strong><span>Instagram found</span></div>
        </div>
        <div className="import-preview">
          <table className="table compact">
            <thead><tr><th>Name</th><th>Phone</th><th className="hide-sm">Email</th><th>Instagram</th></tr></thead>
            <tbody>
              {list.slice(0, 50).map((c, i) => (
                <tr key={i} className="no-hover"><td>{c.name}</td><td>{c.phone || '-'}</td><td className="hide-sm">{c.email || '-'}</td><td>{c.instagram ? `@${c.instagram}` : '-'}</td></tr>
              ))}
            </tbody>
          </table>
          {list.length > 50 && <p className="muted">…and {list.length - 50} more</p>}
        </div>
      </>}
    </Modal>
  );
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export default function Customers() {
  const [q, setQ] = useState('');
  const [list, setList] = useState(null);
  const [sel, setSel] = useState(new Set());
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const load = async () => setList(await api.customers({ q, limit: 5000 }));
  useEffect(() => { const t = setTimeout(load, 150); return () => clearTimeout(t); }, [q]); // eslint-disable-line

  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allOn = list?.length > 0 && list.every((c) => sel.has(c.id));

  const exportCsv = () => {
    const rows = [['Name', 'Phone', 'Email', 'Bookings', 'Date Added'],
      ...(list || []).filter((c) => !sel.size || sel.has(c.id)).map((c) => [c.name, c.phone, c.email, c.booking_count, c.created_at])];
    const blob = new Blob([rows.map((r) => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'customers.csv'; a.click();
    URL.revokeObjectURL(a.href);
  };
  const bulkDelete = async () => {
    await api.bulkDeleteCustomers([...sel]);
    toast(`${sel.size} customer(s) deleted`);
    setSel(new Set()); setConfirmDel(false); load();
  };

  return (
    <div className="page">
      <Topbar icon={LuUsers} title="Customers"
        search={<input placeholder="Search Customers" value={q} onChange={(e) => setQ(e.target.value)} />} />
      <div className="page-actions">
        {sel.size > 0 && <span className="muted">{sel.size} selected</span>}
        <button className="btn btn-primary" onClick={() => setAdding(true)}>Add Customer</button>
        <Dropdown caret={false} icon={<LuEllipsisVertical />} className="dd-plain" items={[
          { label: 'Import customers (CSV)', icon: <LuUpload />, onClick: () => setImporting(true) },
          { label: sel.size ? 'Export selected (CSV)' : 'Export all (CSV)', icon: <LuDownload />, onClick: exportCsv },
          ...(sel.size ? [{ label: `Delete ${sel.size} selected`, icon: <LuTrash2 />, danger: true, onClick: () => setConfirmDel(true) }] : []),
        ]} />
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th className="chk"><input type="checkbox" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(list.map((c) => c.id)))} aria-label="Select all" /><span className="all">All</span></th>
              <th>Name</th><th className="hide-sm">Phone Number</th><th className="hide-md">E-mail Id</th><th>Status</th><th className="hide-sm">Date Added</th>
            </tr>
          </thead>
          <tbody>
            {list === null && <tr><td colSpan={6} className="empty">Loading…</td></tr>}
            {list?.length === 0 && <tr><td colSpan={6} className="empty">{q ? 'No customer matches your search.' : 'No customers yet. Add your first one.'}</td></tr>}
            {list?.map((c) => (
              <tr key={c.id} onClick={() => navigate(`/customers/${c.id}`)}>
                <td className="chk" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Select ${c.name}`} />
                </td>
                <td><div className="name-cell"><span className="avatar"><LuUser /></span><span className="truncate">{c.name}</span></div></td>
                <td className="hide-sm">{c.phone || '-'}</td>
                <td className="hide-md">{c.email || '-'}</td>
                <td><span className={`badge ${c.booking_count ? 'badge-existing' : 'badge-new'}`}>{c.booking_count ? 'Existing' : 'New'}</span></td>
                <td className="hide-sm">{prettyShortDate(c.created_at.slice(0, 10))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {adding && <CustomerModal onClose={() => setAdding(false)} onSaved={() => load()} />}
      {importing && <ImportCustomers onClose={() => setImporting(false)} onDone={load} />}
      {confirmDel && <Confirm title="Delete customers" danger confirmLabel="Delete"
        message={`Delete ${sel.size} customer(s)? Their past bookings stay in the calendar without a customer name.`}
        onClose={() => setConfirmDel(false)} onConfirm={bulkDelete} />}
    </div>
  );
}
