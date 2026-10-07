import {
  LuChartPie, LuCalendarDays, LuUsers, LuLayoutList, LuUsersRound, LuSettings, LuFileText,
  LuChevronLeft, LuLogOut, LuX,
} from 'react-icons/lu';
import { useApp, ADMIN_PAGES } from '../App.jsx';

export const NAV = [
  { key: 'overview', label: 'Overview', icon: LuChartPie },
  { key: 'calendar', label: 'Calendar', icon: LuCalendarDays },
  { key: 'customers', label: 'Customers', icon: LuUsers },
  { key: 'booking-types', label: 'Booking Types', icon: LuLayoutList },
  { key: 'team', label: 'Team Members', icon: LuUsersRound },
  { key: 'setup', label: 'Setup', icon: LuSettings },
  { key: 'reports', label: 'Reports', icon: LuFileText },
];

export function initials(name = '') {
  return name.replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
}

export default function Sidebar({ active, collapsed, onToggle, onClose }) {
  const { meta, logout, user } = useApp();
  const business = meta.settings.businessName;
  const nav = user.is_admin ? NAV
    : NAV.filter((n) => !ADMIN_PAGES.includes(n.key)).map((n) => (n.key === 'setup' ? { ...n, label: 'My account' } : n));
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">P</span>
        <span className="brand-name">{business}</span>
        <button className="icon-btn nav-close" onClick={onClose} aria-label="Close menu"><LuX /></button>
      </div>
      <button className="collapse-btn" onClick={onToggle} aria-label="Collapse sidebar"><LuChevronLeft /></button>
      <nav className="nav">
        {nav.map(({ key, label, icon: Icon }) => (
          <a key={key} href={`#/${key}`} className={`nav-item ${active === key ? 'active' : ''}`} title={label}>
            <Icon className="nav-icon" /><span className="nav-label">{label}</span>
          </a>
        ))}
      </nav>
      <div className="sidebar-foot">
        <button className="nav-item account" onClick={logout} title={`Log out (${user.email})`}>
          <span className="acct-badge">{initials(user.name)}</span>
          <span className="nav-label acct-name">{user.name}<small>{[user.is_admin && 'Admin', user.is_artist && 'Tattoo artist'].filter(Boolean).join(' · ')}</small></span>
          <LuLogOut className="nav-label logout-ic" />
        </button>
      </div>
    </aside>
  );
}
