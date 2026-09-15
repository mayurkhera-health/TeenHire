'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Ranked } from './matching';
import type { StudentProfile } from './types';

/* The client's only route to opportunity data.
 *
 * Three states, and the third is the point: loading, loaded, and failed. A
 * failed load must never render as an empty neighbourhood — "nothing near
 * you" is a sentence this product may only say when it is true, and a student
 * who concludes there is nothing near them does not come back. */

export interface FeedState {
  items: Ranked[];
  beyond: number;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/* A posting as it reaches somebody with no profile: the facts, and no fit,
   because there is nobody to fit it to. */
export type PublicItem = Pick<Ranked, 'opportunity' | 'organization'>;

export interface PublicState {
  item: PublicItem | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

interface Options {
  ids?: string[];
  beyondRadius?: number;
  /* Skip the request entirely — used while the profile is still loading. */
  enabled?: boolean;
}

export function useOpportunities(
  profile: StudentProfile | null,
  { ids, beyondRadius, enabled = true }: Options = {},
): FeedState {
  const [items, setItems] = useState<Ranked[]>([]);
  const [beyond, setBeyond] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const key = JSON.stringify({
    age: profile?.age,
    loc: profile?.searchLocation,
    radius: profile?.radiusMiles,
    types: profile?.types,
    availability: profile?.availability,
    interests: profile?.interests,
    experience: profile?.hasSimilarExperience,
    ids,
    beyondRadius,
  });

  useEffect(() => {
    if (!enabled || !profile) return;

    /* A profile edited mid-flight must not be overwritten by the answer to
       the question the student already changed. */
    let current = true;
    const controller = new AbortController();

    setLoading(true);
    setError(null);

    fetch('/api/opportunities', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ profile, ids, beyondRadius }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const detail = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(detail?.error ?? 'Could not load opportunities');
        }
        return response.json() as Promise<{ items: Ranked[]; beyond: number }>;
      })
      .then((data) => {
        if (!current) return;
        setItems(data.items);
        setBeyond(data.beyond);
        setLoading(false);
      })
      .catch((cause: Error) => {
        if (!current || cause.name === 'AbortError') return;
        setItems([]);
        setError(cause.message);
        setLoading(false);
      });

    return () => {
      current = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { items, beyond, loading, error, reload };
}

/* One opportunity, for a visitor following a shared link before they have a
 * profile on this device — a friend's text, a cleared browser, a different
 * phone. It shares the endpoint rather than adding a second source for the
 * same data, and asks by id only, so nothing here can enumerate the feed. */
export function usePublicOpportunity(id: string, enabled = true): PublicState {
  const [item, setItem] = useState<PublicItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    let current = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch('/api/opportunities', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids: [id] }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load this one');
        return response.json() as Promise<{ items: PublicItem[] }>;
      })
      .then((data) => {
        if (!current) return;
        setItem(data.items[0] ?? null);
        setLoading(false);
      })
      .catch((cause: Error) => {
        if (!current || cause.name === 'AbortError') return;
        setError(cause.message);
        setLoading(false);
      });

    return () => {
      current = false;
      controller.abort();
    };
  }, [id, enabled, nonce]);

  return { item, loading, error, reload: () => setNonce((n) => n + 1) };
}
