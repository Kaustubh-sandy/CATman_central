import { AlertOctagon, CheckCircle2 } from 'lucide-react';
import { useLive } from '../context/LiveContext';

export default function Toast() {
  const { toast } = useLive();
  if (!toast) return null;
  const ok = toast.tone === 'ok';

  return (
    <div
      role="status"
      className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 max-w-[90vw] rounded border-2 px-4 py-3 bg-ink font-condensed font-bold text-xl flex items-center gap-3 ${
        ok ? 'border-ok text-ok' : 'border-danger text-danger'
      }`}
    >
      {ok ? <CheckCircle2 size={28} strokeWidth={2.5} /> : <AlertOctagon size={28} strokeWidth={2.5} />}
      {toast.text}
    </div>
  );
}
