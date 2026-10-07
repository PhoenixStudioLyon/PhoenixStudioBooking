import { useEffect, useState } from 'react';
import { LuChartPie } from 'react-icons/lu';
import Topbar from '../components/Topbar.jsx';
import { api } from '../api.js';
import { bookingTitle, bookingColor } from '../calendar/BookingBlock.jsx';
import { useApp } from '../App.jsx';
import { addDays, longTime, timePart, todayYMD } from '../dates.js';

export default function Overview() {
  const { meta } = useApp();
  const [stats, setStats] = useState(null);
  const [today, setToday] = useState([]);
  useEffect(() => {
    api.stats().then(setStats);
    const t = todayYMD();
    api.bookings({ from: `${t} 00:00`, to: `${addDays(t, 1)} 00:00`, hide_cancelled: 1 }).then(setToday);
  }, []);
  const cards = stats ? [
    ['Appointments today', stats.today], ['Upcoming appointments', stats.upcoming],
    ['Customers', stats.customers], ['Cancelled (all time)', stats.cancelled],
  ] : [];
  return (
    <div className="page">
      <Topbar icon={LuChartPie} title="Overview" />
      <div className="overview">
        <div className="stat-row">
          {cards.map(([l, v]) => <div key={l} className="stat"><div className="stat-v">{v}</div><div className="stat-l">{l}</div></div>)}
        </div>
        <section className="card">
          <h3>Today</h3>
          {today.length === 0 && <p className="muted">Nothing booked today.</p>}
          <ul className="today-list">
            {today.map((b) => (
              <li key={b.id} style={{ '--c': bookingColor(b, meta.settings) }}>
                <span className="t">{longTime(timePart(b.start))} – {longTime(timePart(b.end))}</span>
                <span className="n">{bookingTitle(b)}{b.service_name ? ` · ${b.service_name}` : ''}</span>
                <span className="muted">{b.team_member_name}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
