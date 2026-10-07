import Topbar from '../components/Topbar.jsx';
import { NAV } from '../components/Sidebar.jsx';

export default function Placeholder({ section }) {
  const item = NAV.find((n) => n.key === section);
  return (
    <div className="page">
      <Topbar icon={item?.icon} title={item?.label || 'Not found'} />
      <div className="placeholder">
        <h2>{item ? `${item.label} is coming soon` : 'Page not found'}</h2>
        <p className="muted">This page doesn't exist (anymore).</p>
        <a className="btn btn-primary" href="#/calendar">Go to Calendar</a>
      </div>
    </div>
  );
}
