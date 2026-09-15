'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ApplicationStatus, Interest, OrganizationKind, Timing } from './types';

/* The employer's own data, fetched rather than held.
 *
 * Kept out of the student store: an employer and a student are different
 * people with different sessions, and giving them one context was part of how
 * the two halves ended up in the same browser in the first place. */

export interface EmployerOrg {
  id: string;
  name: string;
  kind: OrganizationKind;
  verificationStatus: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED';
  city: string;
  zip: string;
}

export interface Posting {
  id: string;
  title: string;
  type: string;
  status: string;
  minimumAge: number;
  timing: string[];
  compensation: unknown;
  interested: number;
  publishedAt: string;
}

export interface InterestedStudent {
  applicationId: string;
  firstName: string;
  age: number;
  city: string;
  distanceMiles: number;
  availability: Timing[];
  interests: Interest[];
  thingsDone: string[];
  experience: 'First job' | 'Some experience';
  note: string | null;
  status: ApplicationStatus;
  createdAt: string;
  belowMinimumAge: boolean;
}

export function useEmployer() {
  const [organization, setOrganization] = useState<EmployerOrg | null>(null);
  const [postings, setPostings] = useState<Posting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/employer/opportunities');
      if (!response.ok) throw new Error('Could not load your opportunities');
      const data = (await response.json()) as { organization?: EmployerOrg; postings: Posting[] };
      setOrganization(data.organization ?? null);
      setPostings(data.postings);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /* Pause, mark filled, put it back up. The server refuses a publish from an
     organization that is not verified, so the button asks rather than assumes
     and shows whatever it is told. */
  const setStatus = useCallback(
    async (id: string, status: 'PUBLISHED' | 'PAUSED' | 'FILLED'): Promise<string | null> => {
      const response = await fetch(`/api/employer/opportunities/${id}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        const detail = (await response.json().catch(() => null)) as { error?: string } | null;
        return detail?.error ?? 'Could not change that right now.';
      }
      setPostings((current) => current.map((p) => (p.id === id ? { ...p, status } : p)));
      return null;
    },
    [],
  );

  return { organization, postings, loading, error, reload: load, setStatus };
}

export function useInterestedStudents(opportunityId: string) {
  const [students, setStudents] = useState<InterestedStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/employer/opportunities/${opportunityId}/interests`);
      if (!response.ok) throw new Error('Could not load interested students');
      setStudents(((await response.json()) as { students: InterestedStudent[] }).students);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }, [opportunityId]);

  useEffect(() => {
    void load();
  }, [load]);

  const respond = useCallback(
    async (applicationId: string, decision: 'interested' | 'not_a_match') => {
      /* Optimistic, then reconciled — a decision that appears to do nothing
         for a second reads as a broken button. */
      setStudents((current) =>
        current.map((s) =>
          s.applicationId === applicationId
            ? { ...s, status: decision === 'interested' ? 'EMPLOYER_INTERESTED' : 'NOT_SELECTED' }
            : s,
        ),
      );
      await fetch(`/api/employer/opportunities/${opportunityId}/interests`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ applicationId, decision }),
      });
    },
    [opportunityId],
  );

  return { students, loading, error, reload: load, respond };
}
