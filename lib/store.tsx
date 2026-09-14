'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { DEFAULT_LOCATION } from './geo';
import { INTERESTED_STUDENTS, OPPORTUNITIES, ORGANIZATIONS } from './data';
import type {
  Application,
  ApplicationStatus,
  InterestedStudent,
  Location,
  NotificationPreferences,
  Opportunity,
  OpportunityType,
  Organization,
  StudentProfile,
  Timing,
  Transportation,
  Interest,
} from './types';

/* V1 keeps everything on the device. The shapes below are the ones the API
   would return, so moving to a server is a change of source, not of screens. */

const STORAGE_KEY = 'teenhire.v1';

/* Onboarding writes into a draft, never into the profile. A student who
   backs out halfway has not created anything. */
export interface OnboardingDraft {
  name: string;
  age: number | null;
  searchLocation: Location | null;
  radiusMiles: number | null;
  types: OpportunityType[];
  availability: Timing[];
  interests: Interest[];
  transportation: Transportation[];
}

export const EMPTY_DRAFT: OnboardingDraft = {
  name: '',
  age: null,
  searchLocation: null,
  radiusMiles: null,
  types: [],
  availability: [],
  interests: [],
  transportation: [],
};

export interface EmployerOrg {
  name: string;
  kind: 'business' | 'nonprofit';
  website: string;
  contactName: string;
  email: string;
  /* §34 asks for these because they are what a human reviewer actually
     checks. A posting with no address and no phone cannot be verified. */
  phone: string;
  city: string;
  zip: string;
}

interface PersistedState {
  profile: StudentProfile | null;
  draft: OnboardingDraft;
  saved: string[];
  applications: Application[];
  notifications: NotificationPreferences;
  employerOrg: EmployerOrg | null;
  employerPosts: Opportunity[];
  applicantDecisions: Record<string, 'interested' | 'not_a_match'>;
}

const INITIAL: PersistedState = {
  profile: null,
  draft: EMPTY_DRAFT,
  saved: [],
  applications: [],
  notifications: { types: ['paid', 'internship', 'volunteer'], frequency: 'daily' },
  employerOrg: null,
  employerPosts: [],
  applicantDecisions: {},
};

interface AppValue extends PersistedState {
  /* False until localStorage has been read, so nothing renders a signed-out
     state for a split second and then swaps it. */
  ready: boolean;
  organizations: Organization[];
  opportunities: Opportunity[];
  setDraft: (patch: Partial<OnboardingDraft>) => void;
  completeOnboarding: () => void;
  updateProfile: (patch: Partial<StudentProfile>) => void;
  toggleSaved: (id: string) => void;
  isSaved: (id: string) => boolean;
  expressInterest: (id: string, note?: string) => void;
  withdrawInterest: (id: string) => void;
  applicationFor: (id: string) => Application | undefined;
  setNotifications: (patch: Partial<NotificationPreferences>) => void;
  setEmployerOrg: (org: EmployerOrg) => void;
  publishOpportunity: (opportunity: Opportunity) => void;
  decideApplicant: (studentId: string, decision: 'interested' | 'not_a_match') => void;
  applicantsFor: (opportunityId: string) => InterestedStudent[];
  reset: () => void;
}

const AppContext = createContext<AppValue | null>(null);

function read(): PersistedState {
  if (typeof window === 'undefined') return INITIAL;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL;
    return { ...INITIAL, ...(JSON.parse(raw) as Partial<PersistedState>) };
  } catch {
    /* A corrupt or blocked store should start a student over, not break
       the app on the first screen they see. */
    return INITIAL;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(INITIAL);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setState(read());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* Private browsing and full quotas both land here. The session keeps
         working; it just will not survive a reload. */
    }
  }, [state, ready]);

  const patch = useCallback((next: Partial<PersistedState>) => {
    setState((current) => ({ ...current, ...next }));
  }, []);

  const setDraft = useCallback((next: Partial<OnboardingDraft>) => {
    setState((current) => ({ ...current, draft: { ...current.draft, ...next } }));
  }, []);

  const completeOnboarding = useCallback(() => {
    setState((current) => {
      const { draft } = current;
      const profile: StudentProfile = {
        name: draft.name.trim() || 'there',
        age: draft.age ?? 16,
        searchLocation: draft.searchLocation ?? DEFAULT_LOCATION,
        radiusMiles: draft.radiusMiles ?? 10,
        types: draft.types.length > 0 ? draft.types : ['paid', 'internship', 'volunteer'],
        availability: draft.availability,
        interests: draft.interests,
        transportation: draft.transportation,
        skills: [],
        thingsDone: [],
      };
      return { ...current, profile };
    });
  }, []);

  const updateProfile = useCallback((next: Partial<StudentProfile>) => {
    setState((current) =>
      current.profile ? { ...current, profile: { ...current.profile, ...next } } : current,
    );
  }, []);

  const toggleSaved = useCallback((id: string) => {
    setState((current) => ({
      ...current,
      saved: current.saved.includes(id)
        ? current.saved.filter((s) => s !== id)
        : [id, ...current.saved],
    }));
  }, []);

  const expressInterest = useCallback((id: string, note?: string) => {
    setState((current) => {
      if (current.applications.some((a) => a.opportunityId === id && a.status !== 'WITHDRAWN')) {
        return current;
      }
      const application: Application = {
        opportunityId: id,
        status: 'INTERESTED',
        note,
        createdAt: new Date().toISOString(),
      };
      return {
        ...current,
        applications: [
          application,
          ...current.applications.filter((a) => a.opportunityId !== id),
        ],
      };
    });
  }, []);

  const withdrawInterest = useCallback((id: string) => {
    setState((current) => ({
      ...current,
      applications: current.applications.map((a) =>
        a.opportunityId === id ? { ...a, status: 'WITHDRAWN' as ApplicationStatus } : a,
      ),
    }));
  }, []);

  const setNotifications = useCallback((next: Partial<NotificationPreferences>) => {
    setState((current) => ({ ...current, notifications: { ...current.notifications, ...next } }));
  }, []);

  const publishOpportunity = useCallback((opportunity: Opportunity) => {
    setState((current) => ({ ...current, employerPosts: [opportunity, ...current.employerPosts] }));
  }, []);

  const decideApplicant = useCallback(
    (studentId: string, decision: 'interested' | 'not_a_match') => {
      setState((current) => ({
        ...current,
        applicantDecisions: { ...current.applicantDecisions, [studentId]: decision },
      }));
    },
    [],
  );

  const value = useMemo<AppValue>(() => {
    /* An employer's own drafts sit alongside the seeded set so the preview
       they approved is literally the card a student then sees. */
    const opportunities = [...state.employerPosts, ...OPPORTUNITIES];

    return {
      ...state,
      ready,
      organizations: ORGANIZATIONS,
      opportunities,
      setDraft,
      completeOnboarding,
      updateProfile,
      toggleSaved,
      isSaved: (id) => state.saved.includes(id),
      expressInterest,
      withdrawInterest,
      applicationFor: (id) =>
        state.applications.find((a) => a.opportunityId === id && a.status !== 'WITHDRAWN'),
      setNotifications,
      setEmployerOrg: (org) => patch({ employerOrg: org }),
      publishOpportunity,
      decideApplicant,
      applicantsFor: (opportunityId) =>
        (INTERESTED_STUDENTS[opportunityId] ?? []).map((s) => ({
          ...s,
          decision: state.applicantDecisions[s.id],
        })),
      reset: () => {
        try {
          window.localStorage.removeItem(STORAGE_KEY);
        } catch {
          /* Nothing to clear if the store was never writable. */
        }
        setState(INITIAL);
      },
    };
  }, [
    state,
    ready,
    patch,
    setDraft,
    completeOnboarding,
    updateProfile,
    toggleSaved,
    expressInterest,
    withdrawInterest,
    setNotifications,
    publishOpportunity,
    decideApplicant,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside AppProvider');
  return value;
}
