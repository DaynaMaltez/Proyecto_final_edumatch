export type IconName = 'sparkle' | 'arrow' | 'menu' | 'close' | 'math' | 'language' | 'code' | 'science' | 'school' | 'exam' | 'star' | 'check' | 'book' | 'pin' | 'video' | 'search' | 'users' | 'info';

type IconProps = { name: IconName; className?: string };

export default function Icon({ name, className }: IconProps) {
  const common = { className, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const };
  switch (name) {
    case 'sparkle': return <svg {...common}><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z"/><path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z"/></svg>;
    case 'arrow': return <svg {...common}><path d="M5 12h14M13 6l6 6-6 6"/></svg>;
    case 'menu': return <svg {...common}><path d="M4 7h16M4 12h16M4 17h16"/></svg>;
    case 'close': return <svg {...common}><path d="m6 6 12 12M18 6 6 18"/></svg>;
    case 'math': return <svg {...common}><path d="M5 5h14M12 5v14M6 15l12-6"/><circle cx="7" cy="8" r="1"/><circle cx="17" cy="16" r="1"/></svg>;
    case 'language': return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>;
    case 'code': return <svg {...common}><path d="m8 8-4 4 4 4m8-8 4 4-4 4m-3-11-2 14"/></svg>;
    case 'science': return <svg {...common}><path d="M9 3h6m-5 0v6l-5.1 8.5A2.3 2.3 0 0 0 6.9 21h10.2a2.3 2.3 0 0 0 2-3.5L14 9V3M8 15h8"/><path d="m10 12 1 1 1-1 1 1 1-1"/></svg>;
    case 'school': return <svg {...common}><path d="m3 10 9-6 9 6-9 6-9-6Z"/><path d="M7 13v5c3.3 2.7 6.7 2.7 10 0v-5m4-3v7"/></svg>;
    case 'exam': return <svg {...common}><path d="M7 3h10l3 3v15H4V3h3Zm9 0v4h4M8 12h8m-8 4h6"/><path d="m8 8 1 1 2-2"/></svg>;
    case 'star': return <svg {...common}><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/></svg>;
    case 'check': return <svg {...common}><path d="m5 12 4 4L19 6"/></svg>;
    case 'book': return <svg {...common}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21V5.5Zm0 13A2.5 2.5 0 0 1 6.5 16H20"/><path d="M8 7h7m-7 3h8"/></svg>;
    case 'pin': return <svg {...common}><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>;
    case 'video': return <svg {...common}><rect x="3" y="5" width="13" height="14" rx="2"/><path d="m16 10 5-3v10l-5-3"/></svg>;
    case 'search': return <svg {...common}><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg>;
    case 'users': return <svg {...common}><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20v-1.5a6.5 6.5 0 0 1 13 0V20m1-12.5a3.5 3.5 0 0 1 0 7m2 2a5 5 0 0 1 3 4.5"/></svg>;
    case 'info': return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></svg>;
  }
}
