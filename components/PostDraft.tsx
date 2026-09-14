'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type {
  Experience,
  HoursBucket,
  MinimumAge,
  OpportunityType,
  Timing,
  VolunteerCommitment,
} from '@/lib/types';

/* The posting draft. It lives for the length of the flow and nothing is
   written anywhere until the employer has seen the preview and said yes —
   a draft is never published on their behalf. */

export interface PostDraft {
  type: OpportunityType | null;
  title: string;
  summary: string;
  minimumAge: MinimumAge | null;
  experience: Experience | null;
  timing: Timing[];
  hours: HoursBucket | null;
  payMin: string;
  payMax: string;
  internshipPay: 'paid' | 'stipend' | 'unpaid' | null;
  stipend: string;
  commitment: VolunteerCommitment | null;
}

const EMPTY: PostDraft = {
  type: null,
  title: '',
  summary: '',
  minimumAge: null,
  experience: null,
  timing: [],
  hours: null,
  payMin: '',
  payMax: '',
  internshipPay: null,
  stipend: '',
  commitment: null,
};

interface DraftValue {
  draft: PostDraft;
  set: (patch: Partial<PostDraft>) => void;
  clear: () => void;
}

const Context = createContext<DraftValue | null>(null);

export function PostDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<PostDraft>(EMPTY);

  const value = useMemo<DraftValue>(
    () => ({
      draft,
      set: (patch) => setDraft((current) => ({ ...current, ...patch })),
      clear: () => setDraft(EMPTY),
    }),
    [draft],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function usePostDraft(): DraftValue {
  const value = useContext(Context);
  if (!value) throw new Error('usePostDraft must be used inside PostDraftProvider');
  return value;
}
