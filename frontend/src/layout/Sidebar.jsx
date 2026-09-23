import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, GraduationCap, History, User, Radio, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useLive } from '../context/LiveContext';

const NAV_ITEMS = [
  { to: '/', key: 'nav.dashboard', Icon: LayoutDashboard },
  { to: '/learning', key: 'nav.learning', Icon: GraduationCap },
  { to: '/history', key: 'nav.history', Icon: History },
  { to: '/profile', key: 'nav.profile', Icon: User },
  { to: '/control-room', key: 'nav.controlRoom', Icon: Radio },
];

export default function Sidebar() {
  const { t, incidents } = useLive();
  const [collapsed, setCollapsed] = useState(false);
  const openSos = incidents.filter((i) => i.type === 'SOS' && i.status === 'OPEN').length;

  return (
    <aside className={`hidden md:flex flex-col border-r-2 border-border bg-surface shrink-0 transition-[width] duration-200 ${collapsed ? 'w-20' : 'w-56'}`}>
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center justify-center h-touch border-b-2 border-border text-white/60 hover:text-white"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <PanelLeftOpen size={24} strokeWidth={2.5} /> : <PanelLeftClose size={24} strokeWidth={2.5} />}
      </button>

      <nav className="flex flex-col gap-1 p-2">
        {NAV_ITEMS.map(({ to, key, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `relative flex items-center gap-3 rounded px-3 h-touch font-condensed font-semibold uppercase tracking-wide transition-colors ${
                isActive ? 'bg-catYellow text-ink' : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`
            }
          >
            <Icon size={24} strokeWidth={2.5} aria-hidden="true" className="shrink-0" />
            {!collapsed && <span>{t(key)}</span>}
            {to === '/control-room' && openSos > 0 && (
              <span className="absolute right-2 top-2 min-w-[22px] h-[22px] rounded-full bg-danger text-white text-sm font-bold flex items-center justify-center">
                {openSos}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
