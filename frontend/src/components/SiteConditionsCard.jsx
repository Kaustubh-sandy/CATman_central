import { CloudSun, CloudRain, CloudFog, Thermometer, Eye } from 'lucide-react';
import { useLive } from '../context/LiveContext';

const WEATHER_ICONS = { CLEAR: CloudSun, RAIN: CloudRain, FOG: CloudFog };

export default function SiteConditionsCard({ conditions }) {
  const { t } = useLive();
  const WeatherIcon = WEATHER_ICONS[conditions?.weather] || CloudSun;
  const lowVis = conditions?.visibility === 'LOW';

  return (
    <div className="rounded border-2 border-border bg-surface p-4">
      <div className="font-condensed text-label uppercase tracking-wide text-white/60 mb-3">{t('site.title')}</div>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <WeatherIcon className="mx-auto mb-1" size={28} strokeWidth={2.5} aria-hidden="true" />
          <div className="font-condensed font-bold uppercase">{conditions ? t(`weather.${conditions.weather}`) : '—'}</div>
        </div>
        <div>
          <Thermometer className="mx-auto mb-1" size={28} strokeWidth={2.5} aria-hidden="true" />
          <div className="font-condensed font-bold font-tabular">{conditions ? `${conditions.ambientTempC}°C` : '—'}</div>
        </div>
        <div className={lowVis ? 'text-warn' : ''}>
          <Eye className="mx-auto mb-1" size={28} strokeWidth={2.5} aria-hidden="true" />
          <div className="font-condensed font-bold uppercase">{conditions ? t(`visibility.${conditions.visibility}`) : '—'}</div>
        </div>
      </div>
    </div>
  );
}
