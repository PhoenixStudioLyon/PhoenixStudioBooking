import { useEffect, useState } from 'react';
import { LuPrinter, LuPencil } from 'react-icons/lu';
import Modal, { Confirm } from '../components/Modal.jsx';
import Dropdown from '../components/Dropdown.jsx';
import { toast } from '../components/Toast.jsx';
import { api } from '../api.js';
import { useApp, usePerms } from '../App.jsx';
import { PhotoGrid, shrinkImage } from '../components/Photos.jsx';
import CustomerModal from '../components/CustomerModal.jsx';
import { STATUS, bookingTitle } from './BookingBlock.jsx';
import { bookedOn, datePart, durationLabel, longTime, minutesBetween, prettyDate, timePart } from '../dates.js';

export default function BookingDetails({ booking: b, onClose, onEdit, onChanged }) {
  const { meta } = useApp();
  const perms = usePerms();
  const canEdit = perms.canEdit(b);
  const [confirm, setConfirm] = useState(null);
  const StatusIcon = STATUS[b.status]?.icon;
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [photoToDelete, setPhotoToDelete] = useState(null);
  const [viewCustomer, setViewCustomer] = useState(false);

  useEffect(() => {
    if (b.photo_count) api.bookingPhotos(b.id).then(setPhotos).catch(() => {});
    else setPhotos([]);
  }, [b.id, b.photo_count]);

  const addPhotos = async (files) => {
    if (!files.length) return;
    setUploading(true);
    try {
      for (const file of files) await api.uploadPhoto(b.id, await shrinkImage(file));
      toast(files.length > 1 ? `${files.length} photos added` : 'Photo added');
    } catch (e) { toast(e.message, 'error'); }
    setUploading(false);
    onChanged(await api.booking(b.id));
  };
  const deletePhoto = async (p) => {
    try { await api.deletePhoto(p.id); toast('Photo deleted'); onChanged(await api.booking(b.id)); }
    catch (e) { toast(e.message, 'error'); }
  };

  const setStatus = async (status) => {
    try {
      const nb = await api.updateBooking(b.id, { status, allowOverlap: true });
      toast(`Marked as ${STATUS[status].label.toLowerCase()}`);
      onChanged(nb);
    } catch (e) { toast(e.message, 'error'); }
  };
  const remove = async () => {
    try { await api.deleteBooking(b.id); toast('Booking deleted'); onChanged(null); } catch (e) { toast(e.message, 'error'); }
  };

  const rows = b.type === 'blocker' ? [
    ['Location', b.location_name], ['Team Member', b.team_member_name],
    ['Date', prettyDate(datePart(b.start))],
    ['Time', `${longTime(timePart(b.start))} - ${longTime(timePart(b.end))} (${durationLabel(minutesBetween(b.start, b.end))})`],
    ['Notes', b.notes],
  ] : [
    ['Location', b.location_name], ['Service', b.service_name], ['Team Member', b.team_member_name],
    ['Date', prettyDate(datePart(b.start))],
    ['Time', `${longTime(timePart(b.start))} - ${longTime(timePart(b.end))} (${durationLabel(minutesBetween(b.start, b.end))})`],
    ['Business Timezone', meta.settings.timezone],
    ['Booking ID', b.ref],
    ['Booked on', b.created_at && `${bookedOn(b.created_at)}${b.created_by ? ` by ${b.created_by}` : ''}`],
    ['Price', `${meta.settings.currency} ${Number(b.price).toFixed(2)}`],
    ['Booking Notes', b.notes],
  ];

  return (
    <Modal title={b.type === 'blocker' ? 'Time Blocker' : 'Appointment Details'} onClose={onClose} width={720}
      actions={<>
        <button className="round-btn filled" onClick={() => window.print()} aria-label="Print"><LuPrinter /></button>
        {canEdit && <button className="round-btn filled" onClick={() => onEdit(b)} aria-label="Edit"><LuPencil /></button>}
      </>}
      footer={!canEdit ? null : b.type === 'blocker' ? (
        perms.isAdmin && 
        <button className="btn btn-danger" onClick={() => setConfirm('delete')}>DELETE BLOCKER</button>
      ) : (<>
        {b.status === 'cancelled'
          ? <button className="btn btn-primary" onClick={() => setStatus('confirmed')}>RESTORE APPOINTMENT</button>
          : <button className="btn btn-danger" onClick={() => setConfirm('cancel')}>CANCEL APPOINTMENT</button>}
        <button className="btn" onClick={() => onEdit(b)}>RESCHEDULE</button>
      </>)}>
      <div className="details-head">
        <div>
          <h3>{bookingTitle(b)}</h3>
          {b.customer_phone && <div className="muted">{b.customer_phone}</div>}
          {b.customer_id && perms.isAdmin && <button type="button" className="link link-btn" onClick={() => setViewCustomer(true)}>View customer</button>}
        </div>
        {b.type !== 'blocker' && !canEdit && (
          <span className={`badge st-${b.status}`}>{STATUS[b.status].label}</span>
        )}
        {b.type !== 'blocker' && canEdit && (
          <div className="row-gap">
            <Dropdown className="dd-outline" icon={StatusIcon && <StatusIcon />} label={STATUS[b.status].label}
              items={Object.entries(STATUS).map(([k, s]) => ({ label: s.label, active: k === b.status, icon: <s.icon />, onClick: () => setStatus(k) }))} />
            <Dropdown className="dd-outline" label="More" items={[
              { label: 'Edit booking', onClick: () => onEdit(b) },
              ...(perms.isAdmin ? [{ label: 'Delete booking', danger: true, onClick: () => setConfirm('delete') }] : []),
            ]} />
          </div>
        )}
      </div>
      <dl className="details">
        {rows.filter(([, v]) => v).map(([k, v]) => (<div key={k}><dt>{k}</dt><dd>{v}</dd></div>))}
      </dl>
      <div className="details-photos">
        <div className="lbl">Photos</div>
        {!canEdit && photos.length === 0 && <span className="muted">No photos</span>}
        <PhotoGrid photos={photos} onAdd={canEdit ? addPhotos : null} busy={uploading} onRemove={canEdit ? setPhotoToDelete : null} />
      </div>

      {confirm === 'cancel' && (
        <Confirm title="Cancel appointment" danger confirmLabel="Cancel appointment"
          message="The appointment stays in the history as cancelled and frees up the time slot."
          onClose={() => setConfirm(null)} onConfirm={() => { setConfirm(null); setStatus('cancelled'); }} />
      )}
      {viewCustomer && (
        <CustomerModal id={b.customer_id} onClose={() => setViewCustomer(false)}
          onSaved={async () => onChanged(await api.booking(b.id))} />
      )}
      {photoToDelete && (
        <Confirm title="Delete photo" danger confirmLabel="Delete" message="This permanently removes the photo."
          onClose={() => setPhotoToDelete(null)} onConfirm={() => { const p = photoToDelete; setPhotoToDelete(null); deletePhoto(p); }} />
      )}
      {confirm === 'delete' && (
        <Confirm title="Delete booking" danger confirmLabel="Delete"
          message="This permanently removes the booking. This can't be undone."
          onClose={() => setConfirm(null)} onConfirm={() => { setConfirm(null); remove(); }} />
      )}
    </Modal>
  );
}
