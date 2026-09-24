import { useEffect, useState } from 'react';
import { Bell, Sun, Moon, Languages, MessageCircle, Award } from 'lucide-react';
import { useLive } from '../context/LiveContext';
import { LANGUAGES } from '../i18n';
import StatusPill from '../components/StatusPill';
import SosButton from '../components/sos/SosButton';

export default function TopBar() {
  const { t, operator, machine, language, openAlerts, actions, setAlertCenterOpen, assistantOpen, setAssistantOpen, reminders } = useLive();
  const urgentReminders = reminders.filter((r) => r.priority !== 'LOW');
  const [sunMode, setSunMode] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = sunMode ? 'sun' : 'dark';
  }, [sunMode]);

  const unacked = openAlerts.filter((a) => ['ALERTED', 'ESCALATED'].includes(a.status));
  const bellTone = unacked.some((a) => a.severity === 'CRITICAL') ? 'bg-danger' : unacked.length ? 'bg-warn' : 'bg-white/20';

  return (
    <header className="flex items-center gap-2 md:gap-3 min-h-touch px-3 border-b-2 border-border bg-surface flex-wrap">
      {machine && (
        <div className="flex items-center gap-2 font-condensed font-bold uppercase tracking-wide">
          <span className="hidden lg:inline text-white/60">{t('top.machine')}</span>
          <span className="text-xl">{machine.machineId}</span>
          <StatusPill status={machine.connectivity?.status || 'OFFLINE'} />
        </div>
      )}

      <div className="flex-1" />

      <SosButton />

      <label className="flex items-center gap-1 h-touch px-1 text-white/80" title={t('top.language')}>
        <Languages size={22} strokeWidth={2.5} aria-hidden="true" />
        <select
          value={language}
          onChange={(e) => actions.setLanguage(e.target.value)}
          className="h-12 rounded border-2 border-border bg-ink px-2 font-condensed font-bold text-lg text-white"
          aria-label={t('top.language')}
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={() => setSunMode((s) => !s)}
        className="hidden sm:flex items-center justify-center h-touch w-touch text-white/70 hover:text-white"
        aria-label={t('top.sunMode')}
        title={t('top.sunMode')}
      >
        {sunMode ? <Moon size={22} strokeWidth={2.5} /> : <Sun size={22} strokeWidth={2.5} />}
      </button>

      <button
        type="button"
        onClick={() => setAlertCenterOpen(true)}
        className="relative flex items-center justify-center h-touch w-touch text-white/80 hover:text-white"
        aria-label={`${t('top.alerts')} (${unacked.length})`}
        title={t('top.alerts')}
      >
        <Bell size={26} strokeWidth={2.5} />
        {unacked.length > 0 && (
          <span className={`absolute top-1 right-1 min-w-[24px] h-6 px-1 rounded-full text-ink font-condensed font-bold text-base flex items-center justify-center ${bellTone}`}>
            {unacked.length}
          </span>
        )}
      </button>

      {operator && (
        <div className="hidden md:flex flex-col items-end leading-tight font-condensed uppercase">
          <span className="font-bold text-white/90">{operator.operatorId}</span>
          <span className="text-catYellow text-sm flex items-center gap-1">
            <Award size={14} strokeWidth={2.5} /> {t('top.level', { n: operator.level })} · {operator.xp} XP
          </span>
        </div>
      )}

      <button
        type="button"
        onClick={() => setAssistantOpen(!assistantOpen)}
        className={`relative flex items-center gap-2 h-touch px-3 rounded border-2 border-catYellow font-condensed font-bold uppercase tracking-wide transition-colors ${
          assistantOpen ? 'bg-catYellow text-ink' : 'text-catYellow hover:bg-catYellow hover:text-ink'
        }`}
        aria-label={t('top.assistant')}
      >
        <MessageCircle size={22} strokeWidth={2.5} />
        <span className="hidden sm:inline">{t('top.assistant')}</span>
        {urgentReminders.length > 0 && (
          <span
            className={`absolute -top-2 -right-2 min-w-[24px] h-6 px-1 rounded-full font-condensed font-bold text-base flex items-center justify-center ${
              urgentReminders.some((r) => r.priority === 'HIGH') ? 'bg-danger text-white' : 'bg-warn text-ink'
            }`}
            aria-label={t('assistant.remindersCount', { n: urgentReminders.length })}
          >
            {urgentReminders.length}
          </span>
        )}
      </button>
    </header>
  );
}
