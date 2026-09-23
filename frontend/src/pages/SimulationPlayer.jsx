import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertOctagon } from 'lucide-react';
import { apiClient } from '../api/client';
import SimSession from '../sim/SimSession';
import PrimaryButton from '../components/PrimaryButton';

export default function SimulationPlayer() {
  const { moduleId } = useParams();
  const navigate = useNavigate();
  const [module, setModule] = useState(null);
  const [error, setError] = useState(null);
  const [runKey, setRunKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setModule(null);
    setError(null);
    apiClient
      .get(`/training/modules/${moduleId}`)
      .then((res) => {
        if (!cancelled) setModule(res.data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.error || err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [moduleId]);

  const exit = () => navigate('/learning');

  if (error) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-ink p-4">
        <div className="w-full max-w-md rounded border-2 border-danger p-6 text-center">
          <AlertOctagon className="mx-auto text-danger" size={48} strokeWidth={2.5} />
          <div className="mt-2 font-condensed font-bold text-2xl uppercase">Can't load simulation</div>
          <p className="mt-1 text-white/70">{error}</p>
          <div className="mt-5">
            <PrimaryButton onClick={exit}>Back to E-Learning</PrimaryButton>
          </div>
        </div>
      </div>
    );
  }

  if (!module) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-ink font-condensed text-2xl uppercase text-white/70">
        Loading cab…
      </div>
    );
  }

  return <SimSession key={runKey} module={module} onExit={exit} onRetry={() => setRunKey((k) => k + 1)} />;
}
