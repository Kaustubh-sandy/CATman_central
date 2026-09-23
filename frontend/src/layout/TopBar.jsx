import { useState, useEffect } from 'react';
import { Bell, Sun, Moon, Languages, MessageCircle } from 'lucide-react';
import StatusPill from '../components/StatusPill';

const LANGUAGES = ['EN', 'हिं', 'த'];

export default function TopBar({ machine, operator }) {
  const [sunMode, setSunMode] = useState(false);
  const [language, setLanguage] = useState('EN');

  useEffect(() => {
    document.documentElement.dataset.theme = sunMode ? 'sun' : 'dark';
  }, [sunMode]);

  return (
    <header className="flex items-center gap-4 h-touch px-4 border-b-2 border-border bg-surface">
      {machine && (
        <div className="flex items-center gap-2 font-condensed font-bold uppercase tracking-wide">
          <span className="text-white/60">Machine</span>
          <span>{machine.machineId}</span>
          <StatusPill status={machine.connectivity?.status || 'OFFLINE'} />
        </div>
      )}

      <div className="flex-1" />

      <button
        type="button"
        onClick={() => setLanguage((l) => LANGUAGES[(LANGUAGES.indexOf(l) + 1) % LANGUAGES.length])}
        className="flex items-center gap-1.5 h-touch px-2 font-condensed font-semibold text-white/70 hover:text-white"
        aria-label="Switch language"
        title="Language (display only for now)"
      >
        <Languages size={22} strokeWidth={2.5} aria-hidden="true" />
        {language}
      </button>

      <button
        type="button"
        onClick={() => setSunMode((s) => !s)}
        className="flex items-center justify-center h-touch w-touch text-white/70 hover:text-white"
        aria-label="Toggle sun mode"
        title="Sun Mode"
      >
        {sunMode ? <Moon size={22} strokeWidth={2.5} /> : <Sun size={22} strokeWidth={2.5} />}
      </button>

      <button
        type="button"
        className="relative flex items-center justify-center h-touch w-touch text-white/70 hover:text-white"
        aria-label="Alerts"
        title="Alerts"
      >
        <Bell size={22} strokeWidth={2.5} />
      </button>

      {operator && (
        <div className="font-condensed font-semibold uppercase tracking-wide text-white/80">
          {operator.operatorId}
        </div>
      )}

      <button
        type="button"
        className="flex items-center gap-2 h-touch px-3 rounded border-2 border-catYellow text-catYellow font-condensed font-bold uppercase tracking-wide hover:bg-catYellow hover:text-ink transition-colors"
        aria-label="AI Assistant"
        title="AI Assistant (coming soon)"
      >
        <MessageCircle size={22} strokeWidth={2.5} />
        Assistant
      </button>
    </header>
  );
}
