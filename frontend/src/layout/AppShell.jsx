import Sidebar from './Sidebar';
import TopBar from './TopBar';

export default function AppShell({ machine, operator, children }) {
  return (
    <div className="flex h-screen bg-ink text-white">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <TopBar machine={machine} operator={operator} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
