import BookingBlock from './BookingBlock.jsx';
import { DAY_SHORT, addDays, datePart, fromYMD, todayYMD } from '../dates.js';

export default function MonthGrid({ gridStart, weeks, month, bookings, settings, onDayClick, onSlotClick, onBookingClick }) {
  const today = todayYMD();
  const byDay = {};
  for (const b of bookings) (byDay[datePart(b.start)] ||= []).push(b);

  return (
    <div className="mg">
      <div className="mg-head">
        {DAY_SHORT.map((d) => <div key={d} className="mg-dow">{d}</div>)}
      </div>
      <div className="mg-body">
        {Array.from({ length: weeks }, (_, w) => (
          <div className="mg-week" key={w}>
            {Array.from({ length: 7 }, (_, i) => {
              const day = addDays(gridStart, w * 7 + i);
              const d = fromYMD(day);
              const inMonth = d.getMonth() === month;
              const closed = !settings.openDays.includes(d.getDay());
              return (
                <div key={day} className={`mg-day ${inMonth ? '' : 'out'} ${closed ? 'closed' : ''} ${day === today ? 'is-today' : ''}`}
                  onClick={() => onSlotClick(day)}>
                  <button type="button" className="mg-num" onClick={(e) => { e.stopPropagation(); onDayClick(day); }}>
                    {d.getDate()}
                  </button>
                  <div className="mg-list">
                    {(byDay[day] || []).map((b) => <BookingBlock key={b.id} b={b} compact onClick={onBookingClick} />)}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
