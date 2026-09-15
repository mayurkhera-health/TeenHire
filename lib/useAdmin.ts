'use client';

import { useCallback, useEffect, useState } from 'react';
import type { VerificationStatus } from './types';

export interface AdminOrg {
  id: string; name: string; kind: string; verificationStatus: VerificationStatus;
  website: string | null; phone: string | null; city: string; zip: string;
  contactEmail: string | null; openPostings: number; createdAt: string;
  internalNotes: string | null;
}

export interface AdminOpportunity {
  id: string; title: string; type: string; status: string;
  creationMethod: string; organization: string; interested: number; publishedAt: string;
}

export interface Marketplace {
  supply: { published: number; paid: number; internship: number; volunteer: number;
            pendingReview: number; verifiedOrgs: number; pendingOrgs: number };
  demand: { students: number; byAge: { age: number; count: number }[];
            byType: { type: string; count: number }[] };
  activity: { saves: number; interests: number; employerResponses: number;
              interestRate: number | null; responseRate: number | null;
              medianHoursToFirstInterest: number | null };
}

export interface DemandCell {
  city: string; ageBand: string; type: string; availability: string; students: number;
}

export interface AuditRow {
  actor_label: string; action: string; subject_type: string; subject_id: string; created_at: string;
}

/* The console's data. A 404 from any of these means "you are not an admin" —
   the endpoints do not confirm their own existence to anyone else. */
export function useAdmin() {
  const [marketplace, setMarketplace] = useState<Marketplace | null>(null);
  const [organizations, setOrganizations] = useState<AdminOrg[]>([]);
  const [opportunities, setOpportunities] = useState<AdminOpportunity[]>([]);
  const [demand, setDemand] = useState<{ cells: DemandCell[]; withheld: number; minimumCell: number } | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [m, o, p, d] = await Promise.all([
        fetch('/api/admin/marketplace'),
        fetch('/api/admin/organizations'),
        fetch('/api/admin/opportunities'),
        fetch('/api/admin/demand'),
      ]);
      if (m.status === 404) { setDenied(true); setLoading(false); return; }
      if (!m.ok || !o.ok || !p.ok || !d.ok) throw new Error('Could not load the console');

      const mData = (await m.json()) as { marketplace: Marketplace; audit: AuditRow[] };
      setMarketplace(mData.marketplace);
      setAudit(mData.audit);
      setOrganizations(((await o.json()) as { organizations: AdminOrg[] }).organizations);
      setOpportunities(((await p.json()) as { opportunities: AdminOpportunity[] }).opportunities);
      setDemand((await d.json()) as { cells: DemandCell[]; withheld: number; minimumCell: number });
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const verify = useCallback(
    async (id: string, status: VerificationStatus, note?: string) => {
      const response = await fetch(`/api/admin/organizations/${id}/verification`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status, note }),
      });
      await load();
      return response.ok;
    },
    [load],
  );

  const setStatus = useCallback(
    async (id: string, status: string) => {
      await fetch(`/api/admin/opportunities/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      await load();
    },
    [load],
  );

  return { marketplace, organizations, opportunities, demand, audit, loading, denied, error, reload: load, verify, setStatus };
}
