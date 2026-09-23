import { CloudSun, Thermometer, Eye } from 'lucide-react';

export default function SiteConditionsCard({ conditions }) {
  return (
    <div className="rounded border-2 border-border bg-surface p-4">
      <div className="font-condensed text-label uppercase tracking-wide text-white/60 mb-3">
        Site Conditions
      </div>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <CloudSun className="mx-auto mb-1" size={28} strokeWidth={2.5} aria-hidden="true" />
          <div className="font-condensed font-bold">{conditions?.weather || '—'}</div>
        </div>
        <div>
          <Thermometer className="mx-auto mb-1" size={28} strokeWidth={2.5} aria-hidden="true" />
          <div className="font-condensed font-bold font-tabular">
            {conditions ? `${conditions.ambientTempC}°C` : '—'}
          </div>
        </div>
        <div>
          <Eye className="mx-auto mb-1" size={28} strokeWidth={2.5} aria-hidden="true" />
          <div className="font-condensed font-bold">{conditions?.visibility || '—'}</div>
        </div>
      </div>
    </div>
  );
}
