import { useEffect, useRef, useState } from 'react';
import BookingBlock from './BookingBlock.jsx';
import { datePart, gridLabel, minutesBetween, timePart, toMin, todayYMD } from '../dates.js';

export const PX_PER_MIN = 44 / 30; // one 30-minute row = 44px
const DAY_MIN = 24 * 60;
const SNAP = 15;

// Arrange overlapping bookings side by side (cluster -> lanes)
function layout(items) {
  const sorted = [...items].sort((a, b) => a.s - b.s || b.e - a.e);
  const out = [];
  let cluster = [], lanes = [], clusterEnd = -1;
  const flush = () => { cluster.forEach((it) => { it.lanes = lanes.length; }); out.push(...cluster); cluster = []; lanes = []; };
  for (const it of sorted) {
    if (it.s >= clusterEnd && cluster.length) flush();
    let lane = lanes.findIndex((end) => end <= it.s);
    if (lane === -1) { lane = lanes.length; lanes.push(it.e); } else lanes[lane] = it.e;
    it.lane = lane;
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.e);
  }
  flush();
  return out;
}

/**
 * columns: [{ key, date, teamId, closed }]
 * headers: React nodes rendered above the grid (already aligned to columns)
 */
export default function TimeGrid({ columns, headerRows, bookings, settings, onSlotClick, onBookingClick, onMove, canDrag = () => true }) {
  const scrollRef = useRef(null);
  const [now, setNow] = useState(() => new Date());
  const openStart = toMin(settings.dayStart), openEnd = toMin(settings.dayEnd);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);
  // scroll to opening time when the view changes
  const colKey = columns.map((c) => c.key).join('|');
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = Math.max(0, (openStart - 30) * PX_PER_MIN);
  }, [colKey, openStart]);

  const today = todayYMD();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const rows = Array.from({ length: DAY_MIN / 30 }, (_, i) => i * 30);

  const minutesFromEvent = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return (e.clientY - rect.top) / PX_PER_MIN;
  };

  return (
    <div className="tg">
      <div className="tg-scroll" ref={scrollRef}>
        <div className="tg-inner" style={{ '--cols': columns.length }}>
          <div className="tg-head">
            {headerRows.map((row, i) => (
              <div className="tg-head-row" key={i}>
                <div className="tg-gutter" />
                {row}
              </div>
            ))}
          </div>
          <div className="tg-body" style={{ height: DAY_MIN * PX_PER_MIN }}>
            <div className="tg-gutter tg-times">
              {rows.map((m) => (
                <div key={m} className="tg-time" style={{ top: m * PX_PER_MIN }}>{m ? gridLabel(m) : ''}</div>
              ))}
            </div>
            {columns.map((col) => {
              const items = layout(bookings
                .filter((b) => datePart(b.start) === col.date && (col.teamId == null || b.team_member_id === col.teamId))
                .map((b) => {
                  const s = toMin(timePart(b.start));
                  return { b, s, e: Math.min(DAY_MIN, s + Math.max(15, minutesBetween(b.start, b.end))) };
                }));
              return (
                <div key={col.key}
                  className={`tg-col ${col.closed ? 'closed' : ''} ${col.date === today ? 'is-today' : ''}`}
                  onClick={(e) => {
                    if (e.target !== e.currentTarget && !e.target.classList.contains('tg-cell')) return;
                    const m = Math.floor(minutesFromEvent(e) / 30) * 30;
                    onSlotClick?.(col, m);
                  }}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                  onDrop={(e) => {
                    e.preventDefault();
                    let data;
                    try { data = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; }
                    const m = Math.round((minutesFromEvent(e) - data.grab) / SNAP) * SNAP;
                    onMove?.(data.id, col, Math.max(0, Math.min(DAY_MIN - SNAP, m)));
                  }}>
                  {!col.closed && openStart > 0 && <div className="tg-off" style={{ top: 0, height: openStart * PX_PER_MIN }} />}
                  {!col.closed && openEnd < DAY_MIN && <div className="tg-off" style={{ top: openEnd * PX_PER_MIN, bottom: 0 }} />}
                  {rows.map((m) => (
                    <div key={m} className="tg-cell" style={{ top: m * PX_PER_MIN, height: 30 * PX_PER_MIN }}>
                      <span className="tg-cell-label">{gridLabel(m)}</span>
                    </div>
                  ))}
                  {col.date === today && (
                    <div className="tg-now" style={{ top: nowMin * PX_PER_MIN }} />
                  )}
                  {items.map(({ b, s, e, lane, lanes }) => (
                    <BookingBlock key={b.id} b={b} onClick={onBookingClick}
                      draggable={!!onMove && canDrag(b)}
                      onDragStart={(ev) => {
                        const rect = ev.currentTarget.getBoundingClientRect();
                        ev.dataTransfer.setData('text/plain', JSON.stringify({ id: b.id, grab: (ev.clientY - rect.top) / PX_PER_MIN }));
                        ev.dataTransfer.effectAllowed = 'move';
                      }}
                      style={{
                        position: 'absolute',
                        top: s * PX_PER_MIN + 1,
                        height: Math.max(18, (e - s) * PX_PER_MIN - 2),
                        left: `calc(${(lane / lanes) * 100}% + 2px)`,
                        width: `calc(${100 / lanes}% - 4px)`,
                      }} />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
