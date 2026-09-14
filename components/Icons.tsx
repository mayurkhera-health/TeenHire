/* A deliberately small icon set. Icons label meta and navigation only —
   there is no decorative iconography anywhere in the product. */

interface IconProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false as const,
});

export function Tick({ size = 17, strokeWidth = 2.6, className }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
      <path d="M4.5 12.5l5 5 10-11" />
    </svg>
  );
}

export function Dash({ size = 17, strokeWidth = 2.6, className }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
      <path d="M5 12h14" />
    </svg>
  );
}

export function Heart({ size = 22, filled = false }: IconProps & { filled?: boolean }) {
  return (
    <svg {...base(size)} strokeWidth={2} fill={filled ? 'currentColor' : 'none'}>
      <path d="M12 20.2l-7.1-6.9a4.4 4.4 0 016.2-6.2l.9.9.9-.9a4.4 4.4 0 016.2 6.2z" />
    </svg>
  );
}

export function Pin({ size = 15 }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={1.9}>
      <path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

export function Clock({ size = 15 }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={1.9}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.3l3.3 2" />
    </svg>
  );
}

export function Cake({ size = 15 }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={1.9}>
      <path d="M4 20h16v-6a3 3 0 00-3-3H7a3 3 0 00-3 3z" />
      <path d="M12 8V5" />
      <path d="M4 15.5c1.6 1.2 2.9 1.2 4.5 0s2.9-1.2 4.5 0 2.9 1.2 4.5 0" />
    </svg>
  );
}

export function Spark({ size = 15 }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={1.9}>
      <path d="M12 3.5l1.9 4.9 4.9 1.9-4.9 1.9L12 17.1l-1.9-4.9L5.2 10.3l4.9-1.9z" />
    </svg>
  );
}

export function Search({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={2}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </svg>
  );
}

export function Back({ size = 22 }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={2.2}>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

export function Chevron({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={2.2}>
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function Compass({ size = 23 }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={1.9}>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.4 8.6l-1.8 5-5 1.8 1.8-5z" />
    </svg>
  );
}

export function Activity({ size = 23 }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={1.9}>
      <path d="M3.5 13h4l2.5-6 3.5 12 2.5-6h4.5" />
    </svg>
  );
}

export function Person({ size = 23 }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={1.9}>
      <circle cx="12" cy="8.5" r="3.6" />
      <path d="M4.8 20a7.3 7.3 0 0114.4 0" />
    </svg>
  );
}

export function Plus({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={2.4}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function Shield({ size = 13 }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={2.2}>
      <path d="M12 3l7 2.8v5.4c0 4.3-3 7.7-7 9.3-4-1.6-7-5-7-9.3V5.8z" />
      <path d="M9 12l2 2 4-4.2" />
    </svg>
  );
}
