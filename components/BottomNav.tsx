'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Compass, Heart, Person } from './Icons';

/* Four destinations. Not five, and never a menu. */

const DESTINATIONS = [
  { href: '/discover', label: 'Discover', Icon: Compass },
  { href: '/saved', label: 'Saved', Icon: Heart },
  { href: '/activity', label: 'Activity', Icon: Activity },
  { href: '/me', label: 'Me', Icon: Person },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="nav" aria-label="Main">
      {DESTINATIONS.map(({ href, label, Icon }) => {
        const current = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className="nav-item"
            aria-current={current ? 'page' : undefined}
          >
            <Icon />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
