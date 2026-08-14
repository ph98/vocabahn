import type { HTMLAttributes } from 'react';

export interface LogoProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * 'mark' for the icon mark only, 'full' for icon + "Vocabahn" text.
   * Defaults to 'full'.
   */
  variant?: 'mark' | 'full';
  /**
   * Size presets for the logo mark.
   * 'xs' (20px), 'sm' (24px), 'md' (32px), 'lg' (48px).
   * Defaults to 'md'.
   */
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /**
   * Whether to include the German learning tagline below the wordmark.
   */
  showTagline?: boolean;
}

const SIZE_MAP = {
  xs: { box: 'size-5', text: 'text-sm' },
  sm: { box: 'size-6', text: 'text-base' },
  md: { box: 'size-8', text: 'text-lg' },
  lg: { box: 'size-12', text: 'text-2xl' },
};

/**
 * Aerodynamic V logo mark with Autobahn dash accents.
 * Rendered as an inline SVG to guarantee instant render, 0 CLS, crisp vector scaling at any DPI,
 * and automatic light/dark theme adaptation.
 */
export function LogoMark({
  size = 'md',
  className = '',
}: {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const { box } = SIZE_MAP[size];

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 rounded-xl overflow-hidden shadow-sm border border-surface-700/60 bg-surface-900 ${box} ${className}`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 512 512"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        <defs>
          <linearGradient id="vbLogoBg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" className="[stop-color:var(--color-surface-900)]" />
            <stop offset="100%" className="[stop-color:var(--color-surface-950)]" />
          </linearGradient>
          <linearGradient id="vbVGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" className="[stop-color:var(--color-surface-100)]" />
            <stop offset="100%" className="[stop-color:var(--color-surface-300)]" />
          </linearGradient>
        </defs>

        {/* Card background */}
        <rect x="24" y="24" width="464" height="464" rx="104" fill="url(#vbLogoBg)" />

        {/* Aerodynamic V and Autobahn road dashes */}
        <g transform="translate(32, 32) scale(7)">
          <path
            d="M9 8 L18 8 L32 47 L46 8 L55 8 L35 58 L29 58 Z"
            fill="url(#vbVGrad)"
          />
          {/* Cyan Autobahn dashes */}
          <rect x="24" y="20" width="16" height="4" rx="2" fill="#0088b0" />
          <rect x="28" y="32" width="8" height="4" rx="2" fill="#0088b0" />
        </g>
      </svg>
    </div>
  );
}

/**
 * Vocabahn brand logo component.
 */
export function Logo({
  variant = 'full',
  size = 'md',
  showTagline = false,
  className = '',
  ...rest
}: LogoProps) {
  const { text } = SIZE_MAP[size];

  return (
    <div
      className={`inline-flex items-center gap-2.5 select-none ${className}`}
      aria-hidden="true"
      {...rest}
    >
      <LogoMark size={size} />

      {variant === 'full' && (
        <div className="flex flex-col leading-none">
          <span className={`font-black tracking-tight text-surface-100 ${text}`}>
            Vocab<span className="text-accent-indigo">ahn</span>
          </span>
          {showTagline && (
            <span className="text-[9px] font-bold tracking-widest uppercase text-surface-400 mt-0.5">
              German in the fast lane
            </span>
          )}
        </div>
      )}
    </div>
  );
}
