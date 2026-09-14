'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingScreen } from '@/components/Shell';
import { useApp } from '@/lib/store';

/* A returning student lands on the feed. A new one starts at the welcome
   screen. Neither is asked to sign in first. */

export default function Home() {
  const { ready, profile } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    router.replace(profile ? '/discover' : '/start');
  }, [ready, profile, router]);

  return <LoadingScreen />;
}
