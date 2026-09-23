import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, GraduationCap, History, User, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', Icon: LayoutDashboard },
  { to: '/learning', label: 'E-Learning', Icon: GraduationCap },
  { to: '/history', label: 'Task History', Icon: History },
  { to: '/profile', label: 'Profile', Icon: User },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`hidden md:flex flex-col border-r-2 border-border bg-surface shrink-0 transition-[width] duration-200 ${
        collapsed ? 'w-20' : 'w-56'
      }`}
    >
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center justify-center h-touch border-b-2 border-border text-white/60 hover:text-white"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <PanelLeftOpen size={24} strokeWidth={2.5} /> : <PanelLeftClose size={24} strokeWidth={2.5} />}
      </button>

      <nav className="flex flex-col gap-1 p-2">
        {NAV_ITEMS.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded px-3 h-touch font-condensed font-semibold uppercase tracking-wide transition-colors ${
                isActive
                  ? 'bg-catYellow text-ink'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`
            }
          >
            <Icon size={24} strokeWidth={2.5} aria-hidden="true" className="shrink-0" />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
