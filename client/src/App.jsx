import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';
import Sidebar from './components/Sidebar.jsx';
import { ToastHost } from './components/Toast.jsx';
import Login from './pages/Login.jsx';
import CalendarPage from './calendar/CalendarPage.jsx';
import Customers from './pages/Customers.jsx';
import CustomerDetails from './pages/CustomerDetails.jsx';
import TeamMembers from './pages/TeamMembers.jsx';
import BookingTypes from './pages/BookingTypes.jsx';
import Overview from './pages/Overview.jsx';
import Setup from './pages/Setup.jsx';
import Placeholder from './pages/Placeholder.jsx';
import Reports from './pages/Reports.jsx';

// ---- app-wide context: current user + reference data (locations, team, services, settings)
const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

// What the logged-in user may do. Admins: everything. Tattoo artists: only their own calendar column,
// and they see clients masked (the server enforces this too).
export function permsFor(user) {
  const isAdmin = !!user?.is_admin;
  const ownId = user?.is_artist ? user.team_member_id : null;
  return {
    isAdmin,
    ownTeamMemberId: ownId,
    canCreate: isAdmin || !!ownId,
    canEdit: (b) => isAdmin || (!!ownId && b?.team_member_id === ownId),
  };
}
export const usePerms = () => permsFor(useApp().user);
export const ADMIN_PAGES = ['customers', 'team', 'booking-types', 'reports'];

// ---- minimal hash router: #/calendar, #/customers/12 ...
function useHashRoute() {
  const get = () => (window.location.hash.replace(/^#/, '') || '/calendar');
  const [path, setPath] = useState(get);
  useEffect(() => {
    const on = () => setPath(get());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return path;
}
export const navigate = (to) => { window.location.hash = to; };

export default function App() {
  const [auth, setAuth] = useState({ loading: true });
  const [meta, setMeta] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const path = useHashRoute();

  const loadStatus = useCallback(async () => {
    try {
      const s = await api.status();
      setAuth({ loading: false, ...s });
    } catch {
      setAuth({ loading: false, error: 'Cannot reach the server.' });
    }
  }, []);

  const reloadMeta = useCallback(async () => setMeta(await api.meta()), []);

  useEffect(() => { loadStatus(); }, [loadStatus]);
  useEffect(() => { if (auth.user) reloadMeta(); }, [auth.user, reloadMeta]);
  useEffect(() => {
    const on = () => setAuth((a) => ({ ...a, user: null }));
    window.addEventListener('auth:expired', on);
    return () => window.removeEventListener('auth:expired', on);
  }, []);
  useEffect(() => { setMobileNav(false); }, [path]);

  if (auth.loading) return <div className="boot">Loading…</div>;
  if (auth.error) return <div className="boot">{auth.error}</div>;
  if (!auth.user) {
    return <Login hasUsers={auth.hasUsers} settings={auth.settings}
      onDone={(user) => setAuth((a) => ({ ...a, user, hasUsers: true }))} />;
  }
  if (!meta) return <div className="boot">Loading…</div>;

  const logout = async () => { await api.logout(); setAuth((a) => ({ ...a, user: null })); setMeta(null); };

  let page;
  let [, section, id] = path.split('/');
  if (!auth.user.is_admin && ADMIN_PAGES.includes(section)) section = 'calendar';
  switch (section) {
    case 'overview': page = <Overview />; break;
    case 'calendar': page = <CalendarPage />; break;
    case 'customers': page = id ? <CustomerDetails id={id} /> : <Customers />; break;
    case 'team': page = <TeamMembers />; break;
    case 'booking-types': page = <BookingTypes />; break;
    case 'setup': page = <Setup />; break;
    case 'reports': page = <Reports />; break;
    default: page = <Placeholder section={section} />;
  }

  return (
    <AppCtx.Provider value={{ user: auth.user, meta, reloadMeta, logout, openMobileNav: () => setMobileNav(true) }}>
      <div className={`shell ${collapsed ? 'is-collapsed' : ''} ${mobileNav ? 'nav-open' : ''}`}>
        <Sidebar active={section} collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)}
          onClose={() => setMobileNav(false)} />
        <div className="scrim" onClick={() => setMobileNav(false)} />
        <main className="main">{page}</main>
      </div>
      <ToastHost />
    </AppCtx.Provider>
  );
}
