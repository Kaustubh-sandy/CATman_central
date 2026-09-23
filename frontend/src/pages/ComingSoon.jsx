import { Sparkles } from 'lucide-react';

export default function ComingSoon({ title }) {
  return (
    <div className="max-w-xl mx-auto text-center py-20">
      <Sparkles className="mx-auto mb-4 text-white/40" size={48} strokeWidth={2.5} aria-hidden="true" />
      <div className="font-condensed font-bold text-3xl uppercase mb-2">{title}</div>
      <p className="text-white/60">This section is coming in a later build phase.</p>
    </div>
  );
}
