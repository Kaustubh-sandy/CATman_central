import { useEffect, useState } from 'react';
import { X, Play, Pause, Loader2 } from 'lucide-react';
import { apiClient } from '../../api/client';
import { useLive } from '../../context/LiveContext';

const FIELDS = [
  ['state', ''],
  ['engineTemperature', '°C'],
  ['hydraulicTemperature', '°C'],
  ['nearestObjectDistanceM', 'm'],
  ['speedKph', 'km/h'],
  ['tiltAngleDeg', '°'],
  ['loadWeightKg', 'kg'],
  ['impactG', 'g'],
  ['vibration', 'g'],
  ['seatbeltStatus', ''],
  ['operatorPresent', ''],
];
const STEP_MS = 700;

// Black box: 60 s before and after a critical event, played back on a timeline.
export default function IncidentReplay({ incidentId, onClose }) {
  const { t } = useLive();
  const [incident, setIncident] = useState(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    apiClient.get(`/incidents/${incidentId}`).then((res) => {
      setIncident(res.data);
      setIndex(Math.max(0, (res.data.blackBox?.before?.length || 1) - 1));
    });
  }, [incidentId]);

  const frames = incident ? [...(incident.blackBox?.before || []), ...(incident.blackBox?.after || [])] : [];
  const eventIndex = Math.max(0, (incident?.blackBox?.before?.length || 1) - 1);

  useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => {
      setIndex((i) => {
        if (i >= frames.length - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, STEP_MS);
    return () => clearInterval(id);
  }, [playing, frames.length]);

  const frame = frames[index];
  const eventMs = incident ? Date.parse(incident.createdAt) : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-2xl max-h-full overflow-y-auto rounded border-2 border-catYellow bg-ink p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="font-condensed text-label uppercase text-catYellow">{t('replay.title')}</div>
            <div className="font-condensed font-bold text-2xl">
              {incident ? `${incident.type === 'SOS' ? 'SOS' : incident.ruleId} · ${incident.machineId}` : '…'}
            </div>
          </div>
          <button type="button" onClick={onClose} className="h-touch w-touch rounded border-2 border-white/40 flex items-center justify-center" aria-label="Close">
            <X size={28} strokeWidth={2.5} />
          </button>
        </div>

        {!incident ? (
          <Loader2 className="animate-spin mx-auto" size={40} />
        ) : frames.length === 0 ? (
          <div className="text-white/60">{t('replay.waiting')}</div>
        ) : (
          <>
            <div className="relative h-10 mb-2">
              <input
                type="range"
                min={0}
                max={frames.length - 1}
                value={index}
                onChange={(e) => setIndex(Number(e.target.value))}
                className="w-full h-10 accent-[#FFCD11]"
                aria-label="Timeline"
              />
              <div
                className="absolute top-0 bottom-0 w-1 bg-danger pointer-events-none"
                style={{ left: `${(eventIndex / Math.max(1, frames.length - 1)) * 100}%` }}
                title={t('replay.event')}
              />
            </div>
            <div className="flex items-center justify-between mb-4">
              <button
                type="button"
                onClick={() => {
                  if (index >= frames.length - 1) setIndex(0);
                  setPlaying((p) => !p);
                }}
                className="h-touch px-5 rounded bg-catYellow text-ink font-condensed font-bold text-xl uppercase flex items-center gap-2"
              >
                {playing ? <Pause size={22} /> : <Play size={22} />}
                {playing ? t('replay.pause') : t('replay.play')}
              </button>
              <div className="font-condensed font-bold text-2xl font-tabular">
                {frame ? `${Math.round((Date.parse(frame.timestamp) - eventMs) / 1000)} s` : ''}
              </div>
            </div>
            {!incident.blackBox?.complete && <div className="text-sm text-white/60 mb-2">{t('replay.waiting')}</div>}
            {frame && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {FIELDS.map(([key, unit]) => (
                  <div key={key} className="rounded border-2 border-border p-2">
                    <div className="text-xs uppercase text-white/50">{key}</div>
                    <div className="font-condensed font-bold text-xl font-tabular">
                      {typeof frame[key] === 'boolean' ? (frame[key] ? 'YES' : 'NO') : frame[key] ?? '—'} {unit}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
