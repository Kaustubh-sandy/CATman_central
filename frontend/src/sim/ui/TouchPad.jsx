import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

const BUTTONS = [
  { dx: 0, dy: 1, Icon: ChevronUp, cls: 'col-start-2 row-start-1' },
  { dx: -1, dy: 0, Icon: ChevronLeft, cls: 'col-start-1 row-start-2' },
  { dx: 1, dy: 0, Icon: ChevronRight, cls: 'col-start-3 row-start-2' },
  { dx: 0, dy: -1, Icon: ChevronDown, cls: 'col-start-2 row-start-3' },
];

export default function TouchPad({ side, title, subtitle, simRef }) {
  const set = (x, y) => {
    simRef.current.touch[side] = { x, y };
  };

  return (
    <div className="pointer-events-auto select-none">
      <div className="grid grid-cols-3 grid-rows-3 gap-1 w-[204px]">
        {BUTTONS.map(({ dx, dy, Icon, cls }) => (
          <button
            key={`${dx}${dy}`}
            type="button"
            className={`${cls} h-touch w-touch rounded border-2 border-white/30 bg-black/70 flex items-center justify-center active:bg-catYellow active:text-ink touch-none`}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              set(dx, dy);
            }}
            onPointerUp={() => set(0, 0)}
            onPointerCancel={() => set(0, 0)}
            aria-label={`${title} ${dx < 0 ? 'left' : dx > 0 ? 'right' : dy > 0 ? 'forward' : 'back'}`}
          >
            <Icon size={32} strokeWidth={2.5} />
          </button>
        ))}
        <div className="col-start-2 row-start-2 flex flex-col items-center justify-center text-center leading-tight">
          <span className="font-condensed font-bold text-sm uppercase">{title}</span>
        </div>
      </div>
      <div className="mt-1 w-[204px] text-center font-condensed text-sm uppercase tracking-wide text-white/70">{subtitle}</div>
    </div>
  );
}
