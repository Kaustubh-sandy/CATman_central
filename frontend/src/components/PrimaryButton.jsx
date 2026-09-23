export default function PrimaryButton({ children, icon: Icon, onClick, disabled = false, tone = 'primary' }) {
  const toneClasses =
    tone === 'primary'
      ? 'bg-catYellow text-ink hover:bg-[#e6ba0f] active:bg-[#cca50d]'
      : 'bg-transparent text-white border-2 border-white/40 hover:border-white';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full h-btn rounded flex items-center justify-center gap-3 font-condensed font-bold text-2xl uppercase tracking-wide transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${toneClasses}`}
    >
      {Icon ? <Icon size={32} strokeWidth={2.5} aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
