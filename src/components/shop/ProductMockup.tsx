import { useId } from 'react';

interface ProductMockupProps {
  productKey: string;
  photo: string | null;
  accent: string;
  parkName?: string;
  blurred?: boolean;
  className?: string;
}

// Simple drawn mockups (no stock images): the guest's photo placed on the product.
export default function ProductMockup({ productKey, photo, accent, parkName, blurred = false, className }: ProductMockupProps) {
  const id = useId().replace(/:/g, '');
  const clip = `clip-${id}`;
  const blur = `blur-${id}`;
  const shadow = `shadow-${id}`;
  const filter = blurred ? `url(#${blur})` : undefined;

  const photoRect = (x: number, y: number, w: number, h: number, r = 4) => (
    <>
      <clipPath id={`${clip}-${x}-${y}`}>
        <rect x={x} y={y} width={w} height={h} rx={r} />
      </clipPath>
      <rect x={x} y={y} width={w} height={h} rx={r} fill="#cbd5e1" />
      {photo && (
        <image
          href={photo}
          x={x - 4}
          y={y - 4}
          width={w + 8}
          height={h + 8}
          preserveAspectRatio="xMidYMid slice"
          clipPath={`url(#${clip}-${x}-${y})`}
          filter={filter}
        />
      )}
    </>
  );

  let body: JSX.Element;
  switch (productKey) {
    case 'print':
      body = (
        <g transform="rotate(-4 100 80)" filter={`url(#${shadow})`}>
          <rect x="28" y="22" width="144" height="112" fill="#fff" rx="2" />
          {photoRect(36, 30, 128, 88, 1)}
        </g>
      );
      break;
    case 'postcard':
      body = (
        <g filter={`url(#${shadow})`}>
          <rect x="12" y="26" width="176" height="110" fill="#fff" rx="3" />
          {photoRect(20, 34, 96, 94, 2)}
          <rect x="152" y="36" width="26" height="30" fill="none" stroke={accent} strokeWidth="2" strokeDasharray="3 2" />
          <text x="124" y="84" fontSize="7" fill="#64748b" fontFamily="system-ui">Grüße aus</text>
          <text x="124" y="94" fontSize="7.5" fontWeight="700" fill={accent} fontFamily="system-ui">
            {(parkName || 'deinem Park').slice(0, 14)}
          </text>
          <line x1="124" y1="106" x2="180" y2="106" stroke="#cbd5e1" />
          <line x1="124" y1="116" x2="180" y2="116" stroke="#cbd5e1" />
          <line x1="124" y1="126" x2="170" y2="126" stroke="#cbd5e1" />
        </g>
      );
      break;
    case 'magnet':
      body = (
        <g filter={`url(#${shadow})`}>
          <rect x="52" y="22" width="96" height="96" rx="14" fill="#fff" />
          {photoRect(58, 28, 84, 84, 10)}
          <rect x="58" y="122" width="84" height="6" rx="3" fill={accent} opacity="0.35" />
        </g>
      );
      break;
    case 'mug':
      body = (
        <g filter={`url(#${shadow})`}>
          <path d="M140 58 C172 58 172 112 140 112" fill="none" stroke="#e2e8f0" strokeWidth="12" />
          <rect x="44" y="30" width="100" height="110" rx="10" fill="#f8fafc" stroke="#e2e8f0" />
          <ellipse cx="94" cy="32" rx="50" ry="6" fill="#e2e8f0" />
          {photoRect(54, 50, 80, 64, 3)}
        </g>
      );
      break;
    case 'tshirt':
      body = (
        <g filter={`url(#${shadow})`}>
          <path
            d="M72 18 L52 24 L22 46 L36 70 L54 60 L54 148 L146 148 L146 60 L164 70 L178 46 L148 24 L128 18 C123 31 112 37 100 37 C88 37 77 31 72 18 Z"
            fill="#f8fafc"
            stroke="#e2e8f0"
            strokeWidth="1.5"
          />
          {photoRect(76, 58, 48, 38, 2)}
          <rect x="76" y="100" width="48" height="4" rx="2" fill={accent} opacity="0.5" />
        </g>
      );
      break;
    case 'poster':
      body = (
        <g filter={`url(#${shadow})`}>
          <rect x="54" y="8" width="92" height="124" fill="#fff" rx="1" />
          {photoRect(60, 14, 80, 100, 1)}
          <rect x="60" y="120" width="34" height="4" rx="2" fill={accent} opacity="0.6" />
          <rect x="52" y="4" width="96" height="5" rx="2" fill="#475569" />
          <rect x="52" y="131" width="96" height="5" rx="2" fill="#475569" />
        </g>
      );
      break;
    case 'canvas':
      body = (
        <g filter={`url(#${shadow})`}>
          <path d="M40 24 L160 24 L168 32 L168 136 L48 136 L40 128 Z" fill="#e2e8f0" />
          <rect x="40" y="24" width="120" height="104" fill="#fff" />
          {photoRect(40, 24, 120, 104, 0)}
        </g>
      );
      break;
    case 'keychain':
      body = (
        <g filter={`url(#${shadow})`}>
          <circle cx="100" cy="24" r="14" fill="none" stroke="#94a3b8" strokeWidth="4" />
          <rect x="97" y="36" width="6" height="14" rx="2" fill="#94a3b8" />
          <rect x="60" y="48" width="80" height="96" rx="12" fill="#fff" stroke="#e2e8f0" />
          {photoRect(66, 56, 68, 68, 6)}
          <rect x="76" y="130" width="48" height="5" rx="2.5" fill={accent} opacity="0.5" />
        </g>
      );
      break;
    case 'puzzle':
      body = (
        <g filter={`url(#${shadow})`}>
          <rect x="34" y="26" width="132" height="104" rx="3" fill="#fff" />
          {photoRect(38, 30, 124, 96, 2)}
          <g stroke="#fff" strokeWidth="1.6" fill="none" opacity="0.9">
            <path d="M79 30 v28 c8 -6 8 14 0 8 v28 c8 -6 8 14 0 8 v24" />
            <path d="M121 30 v24 c-8 -6 -8 14 0 8 v30 c-8 -6 -8 14 0 8 v26" />
            <path d="M38 62 h28 c-6 8 14 8 8 0 h30 c-6 8 14 8 8 0 h50" />
            <path d="M38 94 h24 c-6 -8 14 -8 8 0 h34 c-6 -8 14 -8 8 0 h50" />
          </g>
        </g>
      );
      break;
    case 'daypass':
      body = (
        <g filter={`url(#${shadow})`}>
          <g transform="rotate(-10 100 80)">
            <rect x="40" y="34" width="110" height="80" fill="#fff" />
            {photoRect(44, 38, 102, 72, 1)}
          </g>
          <g transform="rotate(6 100 80)">
            <rect x="46" y="38" width="110" height="80" fill="#fff" />
            {photoRect(50, 42, 102, 72, 1)}
          </g>
          <circle cx="160" cy="34" r="16" fill={accent} />
          <text x="160" y="38" fontSize="11" fontWeight="800" fill="#fff" textAnchor="middle" fontFamily="system-ui">
            ALLE
          </text>
        </g>
      );
      break;
    default:
      body = (
        <g filter={`url(#${shadow})`}>
          <rect x="66" y="10" width="68" height="140" rx="12" fill="#0f172a" />
          {photoRect(71, 22, 58, 104, 3)}
          <circle cx="100" cy="138" r="4" fill="#334155" />
          <circle cx="134" cy="26" r="13" fill={accent} />
          <path d="M134 19 v11 m-5 -4 l5 5 l5 -5" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" />
        </g>
      );
  }

  return (
    <svg viewBox="0 0 200 160" className={className} role="img" aria-hidden="true">
      <defs>
        <filter id={blur}>
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
        <filter id={shadow} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodOpacity="0.18" />
        </filter>
      </defs>
      {body}
    </svg>
  );
}
