'use client';

import { notFound, useRouter } from 'next/navigation';
import { use, useState } from 'react';
import { BackButton } from '@/components/Shell';
import { Chip, ProgressRail, Tile } from '@/components/ui';
import {
  ALL_INTERESTS,
  INTEREST_LABEL,
  STUDENT_TIMING,
  TIMING_LABEL,
  TRANSPORT_LABEL,
  TRANSPORT_ORDER,
} from '@/lib/copy';
import { DEFAULT_LOCATION, isPlausibleZip, lookupZip, nearestKnownPlace } from '@/lib/geo';
import { useApp } from '@/lib/store';
import type { Interest, OpportunityType, Timing, Transportation } from '@/lib/types';

/* Five questions, one per screen, each answerable in a couple of seconds.
   Two of them carry an optional sub-question; none of them can be failed. */

const TOTAL_STEPS = 5;

export default function OnboardingStep({ params }: { params: Promise<{ step: string }> }) {
  const { step: raw } = use(params);
  const step = Number(raw);
  if (!Number.isInteger(step) || step < 1 || step > TOTAL_STEPS) notFound();

  return (
    <div className="screen">
      <main className="page gutter">
        <div className="row gap-3">
          {step > 1 ? <BackButton /> : null}
          <div style={{ flex: 1 }}>
            <ProgressRail step={step} total={TOTAL_STEPS} />
          </div>
        </div>
        <Question step={step} />
      </main>
    </div>
  );
}

function Question({ step }: { step: number }) {
  switch (step) {
    case 1:
      return <AgeStep />;
    case 2:
      return <LocationStep />;
    case 3:
      return <DistanceStep />;
    case 4:
      return <InterestStep />;
    default:
      return <AvailabilityStep />;
  }
}

function useStepNav(step: number) {
  const router = useRouter();
  const { completeOnboarding } = useApp();

  return () => {
    if (step < TOTAL_STEPS) {
      router.push(`/onboarding/${step + 1}`);
      return;
    }
    completeOnboarding();
    router.replace('/discover');
  };
}

function Header({ question, why }: { question: string; why: string }) {
  return (
    <div className="question">
      <h1 className="t-display">{question}</h1>
      <p className="t-meta">{why}</p>
    </div>
  );
}

/* ---------- 1 · Age ---------- */

const AGES = [15, 16, 17, 18] as const;

function AgeStep() {
  const { draft, setDraft } = useApp();
  const next = useStepNav(1);

  return (
    <>
      <Header
        question="How old are you?"
        why="We use your age to show opportunities you're eligible for. Employers never see your birthday."
      />
      <div className="answers">
        {AGES.map((age) => (
          <Tile
            key={age}
            label={String(age)}
            note={age === 18 ? 'Opens up a few more roles' : undefined}
            selected={draft.age === age}
            onClick={() => setDraft({ age })}
          />
        ))}
      </div>
      <Continue onClick={next} disabled={draft.age === null} />
    </>
  );
}

/* ---------- 2 · Location ---------- */

function LocationStep() {
  const { draft, setDraft } = useApp();
  const next = useStepNav(2);
  const [zip, setZip] = useState(draft.searchLocation?.zip ?? '');
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const useMyLocation = () => {
    if (!('geolocation' in navigator)) {
      setNotice('This browser will not share a location. A ZIP code works just as well.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const place = nearestKnownPlace({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setDraft({ searchLocation: place });
        setZip(place.zip);
        setNotice(`We'll search around ${place.city}.`);
        setLocating(false);
      },
      () => {
        setNotice('No problem — a ZIP code works just as well.');
        setLocating(false);
      },
      { timeout: 8000 },
    );
  };

  const applyZip = (value: string) => {
    setZip(value);
    if (!isPlausibleZip(value)) {
      setDraft({ searchLocation: null });
      return;
    }
    const known = lookupZip(value);
    /* An unlisted ZIP still moves the student forward. Dead-ending someone
       on their second screen over a gazetteer gap is not acceptable. */
    setDraft({ searchLocation: known ?? { ...DEFAULT_LOCATION, zip: value } });
    setNotice(known ? null : "We don't have much near that ZIP yet — showing the closest area we cover.");
  };

  return (
    <>
      <Header
        question="Where should we look?"
        why="Your search area stays private. Organizations only see roughly how far away you are."
      />
      <div className="answers">
        <button type="button" className="tile" onClick={useMyLocation} disabled={locating}>
          <span>
            <span className="tile-label">{locating ? 'Finding you…' : 'Use my location'}</span>
            <span className="tile-note">Fastest way to get a real list</span>
          </span>
        </button>

        <div className="stack gap-3">
          <label className="t-sub" htmlFor="zip">
            Or enter a ZIP code
          </label>
          <div className="search">
            <input
              id="zip"
              value={zip}
              onChange={(event) => applyZip(event.target.value.replace(/\D/g, '').slice(0, 5))}
              placeholder="95050"
              inputMode="numeric"
              autoComplete="postal-code"
            />
          </div>
          {notice ? (
            <p className="t-meta" role="status">
              {notice}
            </p>
          ) : null}
        </div>
      </div>
      <Continue onClick={next} disabled={draft.searchLocation === null} />
    </>
  );
}

/* ---------- 3 · Distance, plus the optional transport question ---------- */

const RADIUS_CHOICES = [
  { miles: 3, label: '3 miles', note: 'Walking or a short bike ride' },
  { miles: 5, label: '5 miles', note: 'A bike ride or one bus' },
  { miles: 10, label: '10 miles', note: 'A ride or a longer trip' },
  { miles: 25, label: '15+ miles', note: "I can get most places" },
] as const;

function DistanceStep() {
  const { draft, setDraft } = useApp();
  const next = useStepNav(3);

  const toggleTransport = (mode: Transportation) => {
    const selected = draft.transportation.includes(mode);
    setDraft({
      transportation: selected
        ? draft.transportation.filter((t) => t !== mode)
        : [...draft.transportation, mode],
    });
  };

  return (
    <>
      <Header
        question="How far can you travel?"
        why="This is the single biggest thing that changes what you see."
      />
      <div className="answers">
        {RADIUS_CHOICES.map(({ miles, label, note }) => (
          <Tile
            key={miles}
            label={label}
            note={note}
            selected={draft.radiusMiles === miles}
            onClick={() => setDraft({ radiusMiles: miles })}
          />
        ))}
      </div>

      <div className="stack gap-3">
        <h2 className="t-section">How do you usually get around?</h2>
        <p className="t-meta">Optional. It just helps us order things sensibly.</p>
        <div className="chip-wrap">
          {TRANSPORT_ORDER.map((mode) => (
            <Chip
              key={mode}
              label={TRANSPORT_LABEL[mode]}
              selected={draft.transportation.includes(mode)}
              showTick
              onClick={() => toggleTransport(mode)}
            />
          ))}
        </div>
      </div>

      <Continue onClick={next} disabled={draft.radiusMiles === null} />
    </>
  );
}

/* ---------- 4 · What sounds interesting ---------- */

const TYPE_CHOICES: { type: OpportunityType; label: string; note: string }[] = [
  { type: 'paid', label: 'Earn money', note: 'Paid jobs' },
  { type: 'internship', label: 'Get experience', note: 'Internships' },
  { type: 'volunteer', label: 'Help out', note: 'Volunteering' },
];

function InterestStep() {
  const { draft, setDraft } = useApp();
  const next = useStepNav(4);

  const toggle = (type: OpportunityType) => {
    const selected = draft.types.includes(type);
    setDraft({
      types: selected ? draft.types.filter((t) => t !== type) : [...draft.types, type],
    });
  };

  return (
    <>
      <Header
        question="What sounds interesting?"
        why="Pick as many as you like. You can change this whenever you want."
      />
      <div className="answers">
        {TYPE_CHOICES.map(({ type, label, note }) => (
          <Tile
            key={type}
            label={label}
            note={note}
            multi
            selected={draft.types.includes(type)}
            onClick={() => toggle(type)}
          />
        ))}
      </div>
      <Continue onClick={next} disabled={draft.types.length === 0} />
    </>
  );
}

/* ---------- 5 · Availability, plus the optional interests question ---------- */

function AvailabilityStep() {
  const { draft, setDraft } = useApp();
  const next = useStepNav(5);

  const toggleTiming = (timing: Timing) => {
    const selected = draft.availability.includes(timing);
    setDraft({
      availability: selected
        ? draft.availability.filter((t) => t !== timing)
        : [...draft.availability, timing],
    });
  };

  const toggleInterest = (interest: Interest) => {
    const selected = draft.interests.includes(interest);
    setDraft({
      interests: selected
        ? draft.interests.filter((i) => i !== interest)
        : [...draft.interests, interest],
    });
  };

  return (
    <>
      <Header
        question="When are you usually free?"
        why="Rough is fine. No calendar to fill in."
      />
      <div className="chip-wrap">
        {STUDENT_TIMING.map((timing) => (
          <Chip
            key={timing}
            label={TIMING_LABEL[timing]}
            selected={draft.availability.includes(timing)}
            showTick
            onClick={() => toggleTiming(timing)}
          />
        ))}
      </div>

      <div className="stack gap-3">
        <h2 className="t-section">Anything you're into?</h2>
        <p className="t-meta">Optional. Skip it and we'll still find you plenty.</p>
        <div className="chip-wrap">
          {ALL_INTERESTS.map((interest) => (
            <Chip
              key={interest}
              label={INTEREST_LABEL[interest]}
              selected={draft.interests.includes(interest)}
              showTick
              onClick={() => toggleInterest(interest)}
            />
          ))}
        </div>
      </div>

      <Continue onClick={next} disabled={draft.availability.length === 0} label="Show me what's near me" />
    </>
  );
}

function Continue({
  onClick,
  disabled,
  label = 'Continue',
}: {
  onClick: () => void;
  disabled: boolean;
  label?: string;
}) {
  return (
    <div className="sticky-cta">
      <button type="button" className="btn btn-primary btn-block" onClick={onClick} disabled={disabled}>
        {label}
      </button>
    </div>
  );
}
