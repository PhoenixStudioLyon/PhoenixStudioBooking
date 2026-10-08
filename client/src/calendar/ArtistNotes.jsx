import { useEffect, useState } from 'react';
import { LuPencil, LuTrash2 } from 'react-icons/lu';
import { Confirm } from '../components/Modal.jsx';
import { toast } from '../components/Toast.jsx';
import { api } from '../api.js';
import { useApp } from '../App.jsx';
import { bookedOn } from '../dates.js';

// Notes added after booking, each signed with author and time. The booking's own note is not changed.
// canAdd: admins and the booking's own artist. Authors edit/delete their own notes; admins any note.
export default function ArtistNotes({ bookingId, canAdd }) {
  const { user } = useApp();
  const [notes, setNotes] = useState([]);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(null); // { id, body }
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.bookingNotes(bookingId).then(setNotes).catch(() => {});
  useEffect(() => { load(); }, [bookingId]); // eslint-disable-line react-hooks/exhaustive-deps

  const mine = (n) => user.is_admin || n.user_id === user.id;
  const add = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    try { await api.addNote(bookingId, draft.trim()); setDraft(''); await load(); } catch (e) { toast(e.message, 'error'); }
    setBusy(false);
  };
  const save = async () => {
    if (!editing.body.trim()) return toast('The note is empty', 'error');
    try { await api.updateNote(editing.id, editing.body.trim()); setEditing(null); await load(); } catch (e) { toast(e.message, 'error'); }
  };
  const remove = async (n) => {
    try { await api.deleteNote(n.id); toast('Note deleted'); await load(); } catch (e) { toast(e.message, 'error'); }
  };

  if (!notes.length && !canAdd) return null;
  return (
    <div className="artist-notes">
      <div className="lbl">Artist notes</div>
      {notes.length === 0 && <div className="muted an-empty">No artist notes yet.</div>}
      <ul>
        {notes.map((n) => (
          <li key={n.id} className="an-item">
            <div className="an-meta">
              <strong>{n.user_name || 'Someone'}</strong> · {bookedOn(n.created_at)}{n.updated_at ? ' · edited' : ''}
              {mine(n) && editing?.id !== n.id && (
                <span className="an-actions">
                  <button type="button" className="icon-btn" onClick={() => setEditing({ id: n.id, body: n.body })} aria-label="Edit note"><LuPencil /></button>
                  <button type="button" className="icon-btn" onClick={() => setRemoving(n)} aria-label="Delete note"><LuTrash2 /></button>
                </span>
              )}
            </div>
            {editing?.id === n.id ? (
              <div className="an-edit">
                <textarea className="input" rows={3} value={editing.body} autoFocus onChange={(e) => setEditing({ ...editing, body: e.target.value })} />
                <div className="row-gap"><button type="button" className="btn" onClick={() => setEditing(null)}>Cancel</button>
                  <button type="button" className="btn btn-primary" onClick={save}>Save</button></div>
              </div>
            ) : <div className="an-body">{n.body}</div>}
          </li>
        ))}
      </ul>
      {canAdd && (
        <div className="an-add">
          <textarea className="input" rows={2} placeholder="Add a note (e.g. healing, next session, ink used…)" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <button type="button" className="btn btn-primary" disabled={busy || !draft.trim()} onClick={add}>{busy ? 'Adding…' : 'Add note'}</button>
        </div>
      )}
      {removing && <Confirm title="Delete note" danger confirmLabel="Delete" message="Delete this artist note?"
        onClose={() => setRemoving(null)} onConfirm={() => { const n = removing; setRemoving(null); remove(n); }} />}
    </div>
  );
}
