import { Outlet } from 'react-router-dom';
import AppShell from './AppShell';

export default function AppShellRoute() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
