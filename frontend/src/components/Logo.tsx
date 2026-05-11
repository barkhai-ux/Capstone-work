interface LogoProps {
  size?: number;
  className?: string;
  variant?: 'gradient' | 'mono-light' | 'mono-dark';
}

/**
 * NoQuery brand mark — stylized "N" with a sparkle, on a violet gradient tile.
 */
export default function Logo({ size = 36, className = '', variant = 'gradient' }: LogoProps) {
  const id = `nq-${variant}`;
  const radius = size * 0.235;

  const tileFill =
    variant === 'mono-light' ? '#ffffff' :
    variant === 'mono-dark'  ? '#0F0A26' :
    `url(#${id})`;

  const markFill =
    variant === 'mono-light' ? '#0F0A26' : '#ffffff';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      className={className}
      aria-label="NoQuery"
    >
      <defs>
        <linearGradient id={id} x1="2" y1="2" x2="38" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0%"  stopColor="#9B6BFF" />
          <stop offset="55%" stopColor="#7C3AED" />
          <stop offset="100%" stopColor="#4C1D95" />
        </linearGradient>
      </defs>

      {/* Tile */}
      <rect x="0" y="0" width="40" height="40" rx={radius} ry={radius} fill={tileFill} />

      {/* Stylized N */}
      <path
        d="M11 29 L11 13 Q11 11.4 12.6 11.4 L15.4 11.4 Q16.6 11.4 17.4 12.4 L25 22.2 L25 13 Q25 11.4 26.6 11.4 L28.4 11.4 Q30 11.4 30 13 L30 27 Q30 28.6 28.4 28.6 L25.6 28.6 Q24.4 28.6 23.6 27.6 L16 17.8 L16 27 Q16 28.6 14.4 28.6 L12.6 28.6 Q11 28.6 11 27 Z"
        fill={markFill}
      />

      {/* Sparkle */}
      <path
        d="M32.4 7.4 L33.4 10.2 L36.2 11.2 L33.4 12.2 L32.4 15 L31.4 12.2 L28.6 11.2 L31.4 10.2 Z"
        fill={markFill}
        opacity="0.95"
      />
    </svg>
  );
}

/** Wordmark next to the logo tile. */
export function LogoLockup({
  size = 32,
  className = '',
  textClass = 'text-base font-bold tracking-tight',
  textColor = 'text-gray-900',
}: {
  size?: number;
  className?: string;
  textClass?: string;
  textColor?: string;
}) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Logo size={size} />
      <span className={`${textClass} ${textColor}`}>
        No<span className="text-accent-strong">Query</span>
      </span>
    </div>
  );
}
