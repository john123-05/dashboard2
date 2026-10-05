import { useState } from 'react';

interface BeforeAfterSliderProps {
  beforeUrl: string;
  afterUrl: string;
  beforeLabel?: string;
  afterLabel?: string;
}

/** Vorher/Nachher-Vergleich per Schieberegler - z. B. altes vs. neues Kamerabild. */
export default function BeforeAfterSlider({
  beforeUrl,
  afterUrl,
  beforeLabel = 'Vorher',
  afterLabel = 'Nachher',
}: BeforeAfterSliderProps) {
  const [position, setPosition] = useState(50);

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-100">
      <img src={afterUrl} alt={afterLabel} className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 overflow-hidden" style={{ width: `${position}%` }}>
        <img src={beforeUrl} alt={beforeLabel} className="h-full w-full object-cover" />
      </div>
      <div
        className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.15)]"
        style={{ left: `${position}%` }}
      />
      <span className="absolute left-2 top-2 rounded bg-black/50 px-2 py-0.5 text-xs font-medium text-white">
        {beforeLabel}
      </span>
      <span className="absolute right-2 top-2 rounded bg-black/50 px-2 py-0.5 text-xs font-medium text-white">
        {afterLabel}
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={position}
        onChange={(e) => setPosition(Number(e.target.value))}
        className="absolute inset-x-0 bottom-2 mx-auto w-[90%] cursor-pointer accent-sky-600"
        aria-label={`${beforeLabel} / ${afterLabel} Vergleich`}
      />
    </div>
  );
}
