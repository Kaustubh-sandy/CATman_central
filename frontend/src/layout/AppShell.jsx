import { useLive } from '../context/LiveContext';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import AlertBanner from '../components/alerts/AlertBanner';
import AlertCenter from '../components/alerts/AlertCenter';
import SosStatus from '../components/sos/SosStatus';
import AssistantPanel from '../assistant/AssistantPanel';
import IdleLessonPrompt from '../components/IdleLessonPrompt';
import BehaviorLoopBanner from '../components/BehaviorLoopBanner';
import Toast from '../components/Toast';

export default function AppShell({ children }) {
  const { assistantOpen } = useLive();

  return (
    <div className="flex h-screen bg-ink text-white">
      <Sidebar />
      <div className={`flex flex-col flex-1 min-w-0 ${assistantOpen ? 'lg:mr-[28rem]' : ''}`}>
        <TopBar />
        <AlertBanner />
        <SosStatus />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
      <AssistantPanel />
      <AlertCenter />
      <IdleLessonPrompt />
      <BehaviorLoopBanner />
      <Toast />
    </div>
  );
}
