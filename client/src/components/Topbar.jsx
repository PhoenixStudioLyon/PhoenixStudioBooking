import { LuBell, LuMessageSquare, LuMenu, LuSearch } from 'react-icons/lu';
import { useApp } from '../App.jsx';
import { initials } from './Sidebar.jsx';

// Page header: icon + title, search box, notifications, business pill
export default function Topbar({ icon: Icon, title, crumb, search, children }) {
  const { meta, openMobileNav } = useApp();
  return (
    <header className="topbar">
      <button className="icon-btn hamburger" onClick={openMobileNav} aria-label="Open menu"><LuMenu /></button>
      {Icon && <span className="page-icon"><Icon /></span>}
      <div className="page-title">
        {crumb && <div className="crumb">{crumb}</div>}
        <h1>{title}</h1>
      </div>
      {search && (
        <div className="top-search">
          <LuSearch />
          {search}
        </div>
      )}
      <div className="top-right">
        {children}
        <button className="round-btn" aria-label="Notifications"><LuBell /></button>
        <button className="round-btn hide-sm" aria-label="Messages"><LuMessageSquare /></button>
        <div className="biz-pill">
          <span className="biz-logo">{initials(meta.settings.businessName)}</span>
          <span className="hide-sm">{meta.settings.businessName}</span>
        </div>
      </div>
    </header>
  );
}
