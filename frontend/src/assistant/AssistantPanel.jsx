import { useEffect, useRef, useState } from 'react';
import { X, Send, Volume2, ExternalLink, WifiOff, Loader2, BellRing, ChevronRight } from 'lucide-react';
import { apiClient } from '../api/client';
import { useLive } from '../context/LiveContext';
import { useAssistantNavigation } from './useAssistantNavigation';
import { speak } from '../utils/alarm';
import { speechCode } from '../i18n';

const CHIPS = [
  'assistant.chip.next',
  'assistant.chip.summary',
  'assistant.chip.improve',
  'assistant.chip.incident',
];
const REMINDER_STYLE = {
  HIGH: 'border-danger text-danger',
  MEDIUM: 'border-warn text-warn',
  LOW: 'border-white/30 text-white/80',
};

// Reminder text in the operator's language; falls back to the backend's English text.
function reminderText(r, t) {
  const key = `reminder.${r.code}`;
  const params = { ...r.params };
  if (params.ruleId) params.rule = t(`alert.title.${params.ruleId}`);
  const text = t(key, params);
  return text === key ? r.text : text;
}
const HISTORY_TURNS = 8;

export default function AssistantPanel() {
  const { t, language, operator, assistantOpen, setAssistantOpen, reminders, refreshReminders } = useLive();
  const go = useAssistantNavigation();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    if (assistantOpen) refreshReminders();
  }, [assistantOpen, refreshReminders]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const send = async (text) => {
    const message = text.trim();
    if (!message || busy) return;
    const history = messages.slice(-HISTORY_TURNS).map((m) => ({ role: m.role, text: m.text }));
    setMessages((prev) => [...prev, { role: 'user', text: message }]);
    setInput('');
    setBusy(true);
    try {
      const { data } = await apiClient.post('/assistant/chat', { message, history, language }, { timeout: 90000 });
      setMessages((prev) => [...prev, { role: 'assistant', text: data.reply, actions: data.actions || [], mode: data.mode }]);
      if (data.actions?.length) go(data.actions[0]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', text: t('assistant.error'), error: true }]);
    } finally {
      setBusy(false);
    }
  };

  if (!assistantOpen) return null;

  return (
    <aside className="fixed right-0 top-0 bottom-0 z-30 w-full max-w-md bg-ink border-l-2 border-catYellow flex flex-col" aria-label={t('assistant.title')}>
      <div className="flex items-center justify-between p-4 border-b-2 border-border">
        <div className="font-condensed font-bold text-3xl uppercase">{t('assistant.title')}</div>
        <button type="button" onClick={() => setAssistantOpen(false)} className="h-touch w-touch rounded border-2 border-white/40 flex items-center justify-center" aria-label="Close">
          <X size={28} strokeWidth={2.5} />
        </button>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {reminders.length > 0 && (
          <section aria-label={t('assistant.reminders')} className="space-y-2">
            <div className="font-condensed text-label uppercase tracking-wide text-white/60 flex items-center gap-2">
              <BellRing size={18} strokeWidth={2.5} /> {t('assistant.reminders')}
            </div>
            {reminders.slice(0, 5).map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => r.action && go(r.action)}
                className={`w-full min-h-[48px] rounded border-2 bg-surface px-3 py-2 text-left flex items-center gap-2 font-semibold ${REMINDER_STYLE[r.priority]}`}
              >
                <span className="flex-1">{reminderText(r, t)}</span>
                {r.action && <ChevronRight size={20} strokeWidth={2.5} className="shrink-0" />}
              </button>
            ))}
          </section>
        )}
        <div className="rounded border-2 border-border bg-surface p-3 text-lg">{t('assistant.hello', { name: operator?.name?.split(' ')[0] || '' })}</div>
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : ''}>
            <div
              className={`rounded border-2 p-3 text-lg max-w-[90%] ${
                m.role === 'user' ? 'border-catYellow bg-catYellow/10' : m.error ? 'border-danger text-danger' : 'border-border bg-surface'
              }`}
            >
              <div className="whitespace-pre-wrap">{m.text}</div>
              {m.role === 'assistant' && !m.error && (
                <div className="mt-2 flex flex-wrap gap-2 items-center">
                  {m.actions?.map((a, j) => (
                    <button
                      key={j}
                      type="button"
                      onClick={() => go(a)}
                      className="h-touch px-3 rounded bg-catYellow text-ink font-condensed font-bold uppercase flex items-center gap-2"
                    >
                      <ExternalLink size={20} strokeWidth={2.5} />
                      {t('assistant.open')}: {t(`navTarget.${a.target}`)}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => speak(m.text, speechCode(language))}
                    className="h-touch w-touch rounded border-2 border-white/30 flex items-center justify-center"
                    aria-label="Read aloud"
                  >
                    <Volume2 size={22} strokeWidth={2.5} />
                  </button>
                  {m.mode === 'offline' && (
                    <span className="text-xs text-white/50 flex items-center gap-1">
                      <WifiOff size={14} /> {t('assistant.offline')}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-white/60 text-lg">
            <Loader2 className="animate-spin" size={22} /> {t('assistant.thinking')}
          </div>
        )}
      </div>

      <div className="p-4 border-t-2 border-border space-y-3">
        <div className="flex flex-wrap gap-2">
          {CHIPS.map((key) => (
            <button
              key={key}
              type="button"
              disabled={busy}
              onClick={() => send(t(key))}
              className="min-h-[48px] px-3 rounded border-2 border-white/30 text-left font-semibold hover:border-catYellow disabled:opacity-50"
            >
              {t(key)}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={1000}
            placeholder={t('assistant.placeholder')}
            className="flex-1 h-touch rounded border-2 border-border bg-black/40 px-3 text-lg text-white placeholder-white/40"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="h-touch w-touch rounded bg-catYellow text-ink flex items-center justify-center disabled:opacity-40"
            aria-label={t('assistant.send')}
          >
            <Send size={26} strokeWidth={2.5} />
          </button>
        </form>
      </div>
    </aside>
  );
}
