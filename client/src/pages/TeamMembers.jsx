import { useEffect, useState } from 'react';
import { LuUsersRound, LuPencil, LuTrash2, LuCalendarDays, LuMail, LuPhone } from 'react-icons/lu';
import Topbar from '../components/Topbar.jsx';
import Modal, { Confirm } from '../components/Modal.jsx';
import { toast } from '../components/Toast.jsx';
import { api } from '../api.js';
import { useApp, navigate } from '../App.jsx';
import { initials } from '../components/Sidebar.jsx';
import ColorPicker, { PALETTE } from '../components/ColorPicker.jsx';

function MemberForm({ member, onClose, onSaved, usedColors }) {
  const [f, setF] = useState({
    name: member?.name || '', role: member?.role || '', email: member?.email || '', phone: member?.phone || '',
    color: member?.color || PALETTE.find((c) => !usedColors.includes(c)) || PALETTE[0],
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    if (!f.name.trim()) return toast('Name is required', 'error');
    try {
      member ? await api.updateTeamMember(member.id, f) : await api.createTeamMember(f);
      toast(member ? 'Team member updated' : 'Team member added');
      onSaved();
    } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <Modal title={member ? 'Edit Team Member' : 'Add Team Member'} onClose={onClose} width={560}
      actions={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}>
      <div className="form-grid">
        <label className="field"><span className="lbl">Name</span><input className="input" autoFocus value={f.name} onChange={set('name')} placeholder="e.g. Manu Tattoo" /></label>
        <label className="field"><span className="lbl">Role</span><input className="input" value={f.role} onChange={set('role')} placeholder="Tattoo artist, Piercer…" /></label>
        <label className="field"><span className="lbl">Email</span><input className="input" type="email" value={f.email} onChange={set('email')} /></label>
        <label className="field"><span className="lbl">Phone</span><input className="input" value={f.phone} onChange={set('phone')} /></label>
        <div className="field span-2"><span className="lbl">Calendar colour</span>
          <ColorPicker value={f.color} onChange={(color) => setF({ ...f, color })} />
        </div>
      </div>
    </Modal>
  );
}

export default function TeamMembers() {
  const { reloadMeta } = useApp();
  const [list, setList] = useState(null);
  const [editing, setEditing] = useState(null); // null | 'new' | member
  const [removing, setRemoving] = useState(null);

  const load = async () => setList(await api.team());
  useEffect(() => { load(); }, []);

  const afterChange = async () => { setEditing(null); await Promise.all([load(), reloadMeta()]); };
  const remove = async () => {
    try { await api.deleteTeamMember(removing.id); toast('Team member removed'); setRemoving(null); afterChange(); }
    catch (e) { toast(e.message, 'error'); setRemoving(null); }
  };
  const openCalendar = (m) => {
    try { localStorage.setItem('pb:team', JSON.stringify(m.id)); } catch { /* ignore */ }
    navigate('/calendar');
  };

  return (
    <div className="page">
      <Topbar icon={LuUsersRound} title="Team Members" />
      <div className="page-actions">
        <span className="muted">{list ? `${list.length} team member${list.length > 1 ? 's' : ''}` : ''}</span>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>Add Team Member</button>
      </div>
      <div className="team-grid">
        {list?.map((m) => (
          <div className="team-card" key={m.id} style={{ '--c': m.color }}>
            <div className="team-top">
              <span className="team-avatar">{initials(m.name)}</span>
              <div className="grow">
                <div className="team-name">{m.name}</div>
                <div className="muted">{m.role || 'Team member'}</div>
              </div>
              <button className="icon-btn" onClick={() => setEditing(m)} aria-label="Edit"><LuPencil /></button>
              <button className="icon-btn" onClick={() => setRemoving(m)} aria-label="Remove"><LuTrash2 /></button>
            </div>
            <div className="team-meta">
              {m.email && <span><LuMail /> {m.email}</span>}
              {m.phone && <span><LuPhone /> {m.phone}</span>}
              <span className="team-count"><strong>{m.upcoming}</strong> upcoming appointment{m.upcoming === 1 ? '' : 's'}</span>
            </div>
            <button className="btn btn-block" onClick={() => openCalendar(m)}><LuCalendarDays /> View calendar</button>
          </div>
        ))}
      </div>

      {editing && <MemberForm member={editing === 'new' ? null : editing} usedColors={(list || []).map((m) => m.color)}
        onClose={() => setEditing(null)} onSaved={afterChange} />}
      {removing && <Confirm title="Remove team member" danger confirmLabel="Remove"
        message={`Remove ${removing.name}? Their past and future bookings stay in the calendar, but you can no longer book new appointments with them.`}
        onClose={() => setRemoving(null)} onConfirm={remove} />}
    </div>
  );
}
