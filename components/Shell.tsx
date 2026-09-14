'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { BottomNav } from './BottomNav';
import { Back } from './Icons';
import { useApp } from '@/lib/store';

/* The four-destination shell. At 640px and up the nav moves to a top bar —
   the DOM order stays the same so the tab order does too. */

export function NavShell({ children }: { children: ReactNode }) {
  return (
    <div className="screen" data-nav="top">
      <main className="page gutter">{children}</main>
      <BottomNav />
    </div>
  );
}

/* A plain screen with no nav: onboarding, detail, the interest flow and the
   employer console all sit outside the four destinations. */
export function PlainShell({ children }: { children: ReactNode }) {
  return (
    <div className="screen">
      <main className="page gutter">{children}</main>
    </div>
  );
}

export function BackButton({ label = 'Back' }: { label?: string }) {
  const router = useRouter();
  return (
    <button type="button" className="tap pressable" onClick={() => router.back()} aria-label={label}>
      <Back />
    </button>
  );
}

/* Nothing behind onboarding renders until there is a profile to render it
   with — otherwise a student sees an empty feed and assumes it is broken. */
export function RequireProfile({ children }: { children: ReactNode }) {
  const { ready, profile } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (ready && !profile) router.replace('/start');
  }, [ready, profile, router]);

  if (!ready || !profile) return <LoadingScreen />;
  return <>{children}</>;
}

export function LoadingScreen() {
  return (
    <div className="screen">
      <main className="page gutter">
        <p className="t-meta" role="status">
          One moment…
        </p>
      </main>
    </div>
  );
}
