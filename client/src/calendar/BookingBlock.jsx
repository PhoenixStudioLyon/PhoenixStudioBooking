import { LuThumbsUp, LuClock, LuCheck, LuUserX, LuBan, LuCamera } from 'react-icons/lu';
import { shortTime, timePart } from '../dates.js';
import { useApp } from '../App.jsx';

// Appointment colour: its booking type's colour (if set and enabled in Setup), otherwise the artist's
export const bookingColor = (b, settings) =>
  (settings?.colorBy !== 'artist' && b.type !== 'blocker' && b.service_color) || b.team_member_color || '#C8643F';

export const STATUS = {
  confirmed: { label: 'Confirmed', icon: LuThumbsUp },
  pending: { label: 'Pending', icon: LuClock },
  completed: { label: 'Completed', icon: LuCheck },
  no_show: { label: 'No-show', icon: LuUserX },
  cancelled: { label: 'Cancelled', icon: LuBan },
};

export const bookingTitle = (b) => (b.type === 'blocker' ? (b.title || 'Time Blocker') : (b.customer_name || 'Unknown customer'));

// One booking tile. `compact` is used in the month grid.
export default function BookingBlock({ b, style, compact, onClick, draggable, onDragStart }) {
  const { meta } = useApp();
  const Icon = STATUS[b.status]?.icon || LuThumbsUp;
  const range = `${shortTime(timePart(b.start))} - ${shortTime(timePart(b.end))}`;
  const cls = `bk ${b.type === 'blocker' ? 'bk-blocker' : ''} ${b.status === 'cancelled' ? 'bk-cancelled' : ''} ${compact ? 'bk-compact' : ''}`;
  const title = `(${range}) ${bookingTitle(b)}${b.service_name ? ' for ' + b.service_name : ''}${b.team_member_name ? ' · ' + b.team_member_name : ''}`;
  return (
    <button type="button" className={cls} style={{ '--c': bookingColor(b, meta.settings), ...style }}
      onClick={(e) => { e.stopPropagation(); onClick?.(b); }} title={title}
      draggable={draggable} onDragStart={onDragStart}>
      <span className="bk-text">
        <span className="bk-time">{b.type !== 'blocker' && b.status !== 'confirmed' && <Icon className="bk-status" />}{range}</span>{' '}
        <span className="bk-name">{bookingTitle(b)}</span>
        {b.service_name && <> <span className="bk-for">for</span> <span className="bk-svc">{b.service_name}</span></>}
        {b.photo_count > 0 && <> <LuCamera className="bk-photo" aria-label={`${b.photo_count} photo(s)`} /></>}
      </span>
    </button>
  );
}
