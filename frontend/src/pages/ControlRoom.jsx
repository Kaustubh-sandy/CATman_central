import { useEffect, useRef, useState } from 'react';
import { Siren, MapPin, CheckCircle2 } from 'lucide-react';
import { useLive } from '../context/LiveContext';
import { useNow } from '../hooks/useNow';
import { formatRelativeTime } from '../utils/format';
import { playAlarm } from '../utils/alarm';
import StatusPill from '../components/StatusPill';
import AlertItem from '../components/alerts/AlertItem';
import IncidentReplay from '../components/alerts/IncidentReplay';

// Supervisor view: every machine, every SOS, every critical alert nobody acknowledged.
export default function ControlRoom() {
  useNow(5000);
  const { t, machines, incidents, alerts, actions } = useLive();
  const [replayId, setReplayId] = useState(null);
  const heard = useRef(new Set());

  const sos = incidents.filter((i) => i.type === 'SOS' && ['OPEN', 'ACKNOWLEDGED'].includes(i.status));
  const escalated = alerts.filter((a) => a.severity === 'CRITICAL' && ['ALERTED', 'ESCALATED'].includes(a.status));
  const recent = incidents.filter((i) => !['OPEN', 'ACKNOWLEDGED'].includes(i.status) || i.type !== 'SOS').slice(0, 8);

  useEffect(() => {
    sos.filter((s) => s.status === 'OPEN' && !heard.current.has(s.id)).forEach((s) => {
      heard.current.add(s.id);
      playAlarm();
    });
  }, [sos]);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="font-condensed font-bold text-figure uppercase leading-none">{t('control.title')}</div>

      <section>
        <div className="font-condensed text-label uppercase text-danger mb-2">{t('control.sos')}</div>
        {sos.length === 0 ? (
          <div className="rounded border-2 border-border bg-surface p-4 text-white/60">{t('control.noSos')}</div>
        ) : (
          <ul className="space-y-3">
            {sos.map((s) => (
              <li key={s.id} className={`rounded border-2 p-4 ${s.status === 'OPEN' ? 'border-danger bg-danger/15' : 'border-warn bg-warn/10'}`}>
                <div className="flex items-center gap-3 flex-wrap">
                  <Siren size={36} strokeWidth={2.5} className={s.status === 'OPEN' ? 'text-danger animate-pulse' : 'text-warn'} />
                  <div className="flex-1 min-w-[200px]">
                    <div className="font-condensed font-bold text-2xl">{t('sos.newAlarm', { operatorId: s.operatorId, machineId: s.machineId })}</div>
                    <div className="text-white/70 flex items-center gap-1">
                      <MapPin size={16} />
                      {s.location ? `${s.location.latitude.toFixed(5)}, ${s.location.longitude.toFixed(5)}` : '—'} · {formatRelativeTime(s.createdAt, t)}
                    </div>
                  </div>
                  {s.status === 'OPEN' ? (
                    <button type="button" onClick={() => actions.updateIncident(s.id, 'ack')} className="h-touch px-4 rounded bg-catYellow text-ink font-condensed font-bold text-lg uppercase">
                      {t('control.ack')}
                    </button>
                  ) : (
                    <button type="button" onClick={() => actions.updateIncident(s.id, 'resolve')} className="h-touch px-4 rounded border-2 border-white/40 font-condensed font-bold text-lg uppercase">
                      {t('control.resolve')}
                    </button>
                  )}
                  <button type="button" onClick={() => setReplayId(s.id)} className="h-touch px-4 rounded border-2 border-white/40 font-condensed font-bold text-lg uppercase">
                    {t('alerts.replay')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {escalated.length > 0 && (
        <section>
          <div className="font-condensed text-label uppercase text-danger mb-2">{t('control.escalated')}</div>
          <ul className="space-y-3">
            {escalated.map((a) => (
              <AlertItem key={a.id} alert={a} onReplay={setReplayId} />
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="font-condensed text-label uppercase text-white/60 mb-2">{t('control.fleet')}</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {machines.map((m) => {
            const open = alerts.filter((a) => a.machineId === m.machineId && a.status !== 'RESOLVED').length;
            return (
              <div key={m.machineId} className="rounded border-2 border-border bg-surface p-4">
                <div className="flex items-center justify-between">
                  <div className="font-condensed font-bold text-2xl">{m.machineId}</div>
                  <StatusPill status={m.connectivity?.status} />
                </div>
                <div className="mt-2 text-white/70">
                  {m.telemetry ? `${t(`machineState.${m.telemetry.state}`)} · ${m.telemetry.operatorId || '—'} · ${m.telemetry.engineTemperature} °C` : t('card.noData')}
                </div>
                <div className={`mt-1 font-condensed font-bold ${open ? 'text-danger' : 'text-ok'}`}>
                  {open ? `${open} ${t('top.alerts')}` : <CheckCircle2 size={20} />}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {recent.length > 0 && (
        <section>
          <div className="font-condensed text-label uppercase text-white/60 mb-2">{t('control.incidents')}</div>
          <ul className="divide-y-2 divide-border rounded border-2 border-border bg-surface">
            {recent.map((i) => (
              <li key={i.id} className="p-3 flex items-center gap-3">
                <span className="font-condensed font-bold w-40 shrink-0">{i.id}</span>
                <span className="flex-1 text-white/70">
                  {i.type} · {i.machineId} · {i.ruleId || ''} {i.failedSensors ? i.failedSensors.map((f) => f.sensor).join(', ') : ''}
                </span>
                <span className="text-white/50 text-sm">{i.status}</span>
                {i.hasBlackBox !== false && i.type !== 'MAINTENANCE' && (
                  <button type="button" onClick={() => setReplayId(i.id)} className="h-12 px-3 rounded border-2 border-white/40 font-condensed font-bold uppercase">
                    {t('alerts.replay')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {replayId && <IncidentReplay incidentId={replayId} onClose={() => setReplayId(null)} />}
    </div>
  );
}
