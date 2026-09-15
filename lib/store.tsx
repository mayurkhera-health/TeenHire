'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { DEFAULT_LOCATION } from './geo';
import type { Account } from './auth';
import type {
  Application,
  Interest,
  NotificationPreferences,
  OpportunityType,
  StudentProfile,
  Timing,
  Transportation,
} from './types';

/* Client state.
 *
 * The server is authoritative for anything a second device or another person
 * has to see: the account, the profile, saves, expressions of interest.
 *
 * One thing is deliberately still local. Onboarding happens before there is an
 * account, because the product's first promise is that you can look around
 * without signing up. So the draft — and the profile it produces — live in the
 * browser until the student first expresses interest, and are pushed up at
 * that moment. Saves made while signed out go up with them; a student who
 * hearted three things before signing in must not lose them. */

const LOCAL_KEY = 'teenhire.local.v2';

export interface OnboardingDraft {
  name: string;
  age: number | null;
  searchLocation: StudentProfile['searchLocation'] | null;
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

interface LocalState {
  draft: OnboardingDraft;
  /* Only used before an account exists. Once signed in the server wins. */
  profile: StudentProfile | null;
  saved: string[];
  notifications: NotificationPreferences;
}

const INITIAL_LOCAL: LocalState = {
  draft: EMPTY_DRAFT,
  profile: null,
  saved: [],
  notifications: { types: ['paid', 'internship', 'volunteer'], frequency: 'daily' },
};

interface AppValue {
  ready: boolean;
  account: Account | null;
  profile: StudentProfile | null;
  draft: OnboardingDraft;
  saved: string[];
  applications: Application[];
  notifications: NotificationPreferences;
  signedIn: boolean;

  setDraft: (patch: Partial<OnboardingDraft>) => void;
  completeOnboarding: () => void;
  updateProfile: (patch: Partial<StudentProfile>) => void;
  toggleSaved: (id: string) => void;
  isSaved: (id: string) => boolean;
  expressInterest: (id: string, note?: string) => Promise<{ ok: boolean; error?: string }>;
  withdrawInterest: (id: string) => void;
  applicationFor: (id: string) => Application | undefined;
  setNotifications: (patch: Partial<NotificationPreferences>) => void;
  refreshAccount: () => Promise<void>;
  signOut: () => Promise<void>;
  reset: () => void;
}

const AppContext = createContext<AppValue | null>(null);

function readLocal(): LocalState {
  if (typeof window === 'undefined') return INITIAL_LOCAL;
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    return raw ? { ...INITIAL_LOCAL, ...(JSON.parse(raw) as Partial<LocalState>) } : INITIAL_LOCAL;
  } catch {
    return INITIAL_LOCAL;
  }
}

const json = (url: string, method: string, body?: unknown) =>
  fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

export function AppProvider({ children }: { children: ReactNode }) {
  const [local, setLocal] = useState<LocalState>(INITIAL_LOCAL);
  const [account, setAccount] = useState<Account | null>(null);
  const [serverProfile, setServerProfile] = useState<StudentProfile | null>(null);
  const [serverSaved, setServerSaved] = useState<string[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [ready, setReady] = useState(false);
  const syncedRef = useRef(false);

  /* Boot: read what the browser remembers, then ask the server who we are.
     The local read is synchronous so a signed-out student sees their own
     onboarding immediately rather than a flash of the welcome screen. */
  useEffect(() => {
    const stored = readLocal();
    setLocal(stored);

    (async () => {
      try {
        const response = await fetch('/api/auth/me');
        const data = (await response.json()) as {
          user: { id: string; contact: string; method: string; role: string } | null;
          profile: StudentProfile | null;
        };
        if (data.user) {
          setAccount({
            id: data.user.id,
            contact: data.user.contact,
            method: data.user.method as Account['method'],
            createdAt: '',
            verifiedAt: '',
          });
          setServerProfile(data.profile);
        }
      } catch {
        /* Signed out, or the server is unreachable. Either way the student can
           still browse — the feed reports its own failure. */
      } finally {
        setReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(LOCAL_KEY, JSON.stringify(local));
    } catch {
      /* Private browsing. The session keeps working; it just will not survive
         a reload until the student signs in. */
    }
  }, [local, ready]);

  const signedIn = account !== null;
  const profile = signedIn ? serverProfile ?? local.profile : local.profile;
  const saved = signedIn ? serverSaved : local.saved;

  const pullServerState = useCallback(async () => {
    const [savedResponse, interestResponse] = await Promise.all([
      fetch('/api/me/saved'),
      fetch('/api/interests'),
    ]);
    if (savedResponse.ok) setServerSaved(((await savedResponse.json()) as { saved: string[] }).saved);
    if (interestResponse.ok) {
      const data = (await interestResponse.json()) as { applications: Application[] };
      setApplications(data.applications);
    }
  }, []);

  /* The moment an account appears, everything gathered while signed out is
     carried up. Doing it once is guarded by a ref rather than state so a slow
     network cannot cause it twice. */
  useEffect(() => {
    if (!signedIn || syncedRef.current) return;
    syncedRef.current = true;

    (async () => {
      if (!serverProfile && local.profile) {
        await json('/api/me/profile', 'PUT', { profile: local.profile });
        const response = await fetch('/api/auth/me');
        if (response.ok) {
          setServerProfile(((await response.json()) as { profile: StudentProfile | null }).profile);
        }
      }
      for (const id of local.saved) {
        await json('/api/me/saved', 'POST', { opportunityId: id });
      }
      /* Preferences have to travel too. They used to live only here, which was
         harmless while nothing sent anything — the browser was the only reader.
         The sender runs on the server and cannot see localStorage, so a
         student who switched notifications off before signing up would have
         started receiving them. */
      await json('/api/me/notifications', 'PUT', { preferences: local.notifications });
      await pullServerState();
      setLocal((current) => ({ ...current, saved: [] }));
    })();
  }, [signedIn, serverProfile, local.profile, local.saved, local.notifications, pullServerState]);

  const setDraft = useCallback((patch: Partial<OnboardingDraft>) => {
    setLocal((current) => ({ ...current, draft: { ...current.draft, ...patch } }));
  }, []);

  const completeOnboarding = useCallback(() => {
    setLocal((current) => {
      const { draft } = current;
      const built: StudentProfile = {
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
      return { ...current, profile: built };
    });
  }, []);

  const updateProfile = useCallback(
    (patch: Partial<StudentProfile>) => {
      const next = { ...(profile as StudentProfile), ...patch };
      if (signedIn) {
        setServerProfile(next);
        void json('/api/me/profile', 'PUT', { profile: next });
      } else {
        setLocal((current) => ({ ...current, profile: next }));
      }
    },
    [profile, signedIn],
  );

  const toggleSaved = useCallback(
    (id: string) => {
      if (signedIn) {
        /* Optimistic: a heart that waits on a round trip feels broken. */
        setServerSaved((current) =>
          current.includes(id) ? current.filter((s) => s !== id) : [id, ...current],
        );
        void json('/api/me/saved', 'POST', { opportunityId: id });
      } else {
        setLocal((current) => ({
          ...current,
          saved: current.saved.includes(id)
            ? current.saved.filter((s) => s !== id)
            : [id, ...current.saved],
        }));
      }
    },
    [signedIn],
  );

  const expressInterest = useCallback(
    async (id: string, note?: string) => {
      const response = await json('/api/interests', 'POST', { opportunityId: id, note });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) return { ok: false, error: data.error ?? 'Could not send that' };
      await pullServerState();
      return { ok: true };
    },
    [pullServerState],
  );

  const withdrawInterest = useCallback(
    (id: string) => {
      setApplications((current) =>
        current.map((a) => (a.opportunityId === id ? { ...a, status: 'WITHDRAWN' } : a)),
      );
      void json('/api/interests', 'DELETE', { opportunityId: id });
    },
    [],
  );

  const refreshAccount = useCallback(async () => {
    const response = await fetch('/api/auth/me');
    if (!response.ok) return;
    const data = (await response.json()) as {
      user: { id: string; contact: string; method: string } | null;
      profile: StudentProfile | null;
    };
    if (data.user) {
      setAccount({
        id: data.user.id,
        contact: data.user.contact,
        method: data.user.method as Account['method'],
        createdAt: '',
        verifiedAt: '',
      });
      setServerProfile(data.profile);
    }
  }, []);

  const signOut = useCallback(async () => {
    await json('/api/auth/signout', 'POST');
    syncedRef.current = false;
    setAccount(null);
    setServerProfile(null);
    setServerSaved([]);
    setApplications([]);
  }, []);

  const value = useMemo<AppValue>(
    () => ({
      ready,
      account,
      profile,
      draft: local.draft,
      saved,
      applications,
      notifications: local.notifications,
      signedIn,
      setDraft,
      completeOnboarding,
      updateProfile,
      toggleSaved,
      isSaved: (id) => saved.includes(id),
      expressInterest,
      withdrawInterest,
      applicationFor: (id) =>
        applications.find((a) => a.opportunityId === id && a.status !== 'WITHDRAWN'),
      setNotifications: (patch) =>
        setLocal((current) => {
          const next = { ...current.notifications, ...patch };
          /* Written through for a signed-in student. The local copy stays so
             the toggle responds instantly and so a student who has not made an
             account yet still has somewhere to keep the answer. */
          if (signedIn) void json('/api/me/notifications', 'PUT', { preferences: next });
          return { ...current, notifications: next };
        }),
      refreshAccount,
      signOut,
      reset: () => {
        try {
          window.localStorage.removeItem(LOCAL_KEY);
        } catch {
          /* Nothing to clear if the store was never writable. */
        }
        setLocal(INITIAL_LOCAL);
        void signOut();
      },
    }),
    [
      ready,
      account,
      profile,
      local.draft,
      local.notifications,
      saved,
      applications,
      signedIn,
      setDraft,
      completeOnboarding,
      updateProfile,
      toggleSaved,
      expressInterest,
      withdrawInterest,
      refreshAccount,
      signOut,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside AppProvider');
  return value;
}
