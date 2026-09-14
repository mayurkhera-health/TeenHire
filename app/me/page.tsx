'use client';

import { useState } from 'react';
import { NavShell, RequireProfile } from '@/components/Shell';
import { Chip, Sheet } from '@/components/ui';
import {
  ALL_INTERESTS,
  INTEREST_LABEL,
  STUDENT_TIMING,
  TIMING_LABEL,
  TRANSPORT_LABEL,
  TRANSPORT_ORDER,
  TYPE_LABEL,
} from '@/lib/copy';
import { maskContact } from '@/lib/auth';
import { RADIUS_OPTIONS, radiusLabel } from '@/lib/sections';
import { useApp } from '@/lib/store';
import type { Interest, OpportunityType, Timing, Transportation } from '@/lib/types';

/* Not a résumé and not a percentage. The prompts on this screen are
   invitations with a reason attached — never a bar telling a sixteen-year-old
   they are 37% of a person. */

const SKILLS = [
  'Good with people',
  'Good with kids',
  'Organised',
  'Show up on time',
  'Work a till',
  'Speak another language',
  'Computers',
  'Lifting and moving',
  'Cooking',
  'Animals',
];

const THINGS_DONE = [
  'Babysitting',
  'School club',
  'Sports team',
  'Volunteering',
  'Tutoring',
  'Helping a family business',
  'School project',
  'Looking after a pet',
];

export default function MePage() {
  return (
    <RequireProfile>
      <NavShell>
        <Me />
      </NavShell>
    </RequireProfile>
  );
}

function Me() {
  const { profile, updateProfile, notifications, setNotifications, reset, account, signOut } =
    useApp();
  const [sheet, setSheet] = useState<'radius' | 'notifications' | null>(null);
  const student = profile!;

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  return (
    <>
      <header className="stack gap-2">
        <h1 className="t-greeting">About me</h1>
        <p className="t-sub">
          {student.age} · {student.searchLocation.city} · within {radiusLabel(student.radiusMiles).toLowerCase()}
        </p>
      </header>

      {student.interests.length < 3 ? (
        <Prompt
          heading="Want better matches?"
          body="Add a few interests and the sections up top start looking more like you."
        />
      ) : student.thingsDone.length === 0 ? (
        <Prompt
          heading="Help employers get to know you"
          body="Add something you've done. Babysitting and school clubs both count."
        />
      ) : null}

      <Group title="What I'm looking for">
        <div className="chip-wrap">
          {(['paid', 'internship', 'volunteer'] as OpportunityType[]).map((type) => (
            <Chip
              key={type}
              label={TYPE_LABEL[type]}
              selected={student.types.includes(type)}
              showTick
              onClick={() => updateProfile({ types: toggle(student.types, type) })}
            />
          ))}
        </div>
      </Group>

      <Group title="When I'm free">
        <div className="chip-wrap">
          {STUDENT_TIMING.map((timing: Timing) => (
            <Chip
              key={timing}
              label={TIMING_LABEL[timing]}
              selected={student.availability.includes(timing)}
              showTick
              onClick={() => updateProfile({ availability: toggle(student.availability, timing) })}
            />
          ))}
        </div>
      </Group>

      <Group title="How far I can travel">
        <button type="button" className="btn btn-secondary btn-block" onClick={() => setSheet('radius')}>
          {radiusLabel(student.radiusMiles)} from {student.searchLocation.city}
        </button>
      </Group>

      <Group title="How I get around">
        <div className="chip-wrap">
          {TRANSPORT_ORDER.map((mode: Transportation) => (
            <Chip
              key={mode}
              label={TRANSPORT_LABEL[mode]}
              selected={student.transportation.includes(mode)}
              showTick
              onClick={() =>
                updateProfile({ transportation: toggle(student.transportation, mode) })
              }
            />
          ))}
        </div>
      </Group>

      <Group title="Things I'm good at">
        <div className="chip-wrap">
          {SKILLS.map((skill) => (
            <Chip
              key={skill}
              label={skill}
              selected={student.skills.includes(skill)}
              showTick
              onClick={() => updateProfile({ skills: toggle(student.skills, skill) })}
            />
          ))}
        </div>
      </Group>

      <Group title="Things I've done">
        <p className="t-meta">All optional. None of this has to be a job.</p>
        <div className="chip-wrap">
          {THINGS_DONE.map((thing) => (
            <Chip
              key={thing}
              label={thing}
              selected={student.thingsDone.includes(thing)}
              showTick
              onClick={() => updateProfile({ thingsDone: toggle(student.thingsDone, thing) })}
            />
          ))}
        </div>
      </Group>

      <Group title="Interests">
        <div className="chip-wrap">
          {ALL_INTERESTS.map((interest: Interest) => (
            <Chip
              key={interest}
              label={INTEREST_LABEL[interest]}
              selected={student.interests.includes(interest)}
              showTick
              onClick={() => updateProfile({ interests: toggle(student.interests, interest) })}
            />
          ))}
        </div>
      </Group>

      <Group title="Telling me about new things">
        <button
          type="button"
          className="btn btn-secondary btn-block"
          onClick={() => setSheet('notifications')}
        >
          {notifications.frequency === 'off'
            ? 'Notifications off'
            : `${notifications.types.length} of 3 types · ${notifications.frequency}`}
        </button>
      </Group>

      <Group title="Your account">
        {account ? (
          <>
            <p className="t-body">
              Organizations reach you at {maskContact(account)}. Nothing else about you is shared.
            </p>
            {/* Signing out takes back what was sent on their behalf. Saying so
                plainly matters more than the button being tidy. */}
            <button type="button" className="btn btn-secondary btn-block" onClick={signOut}>
              Sign out and withdraw what I&rsquo;ve sent
            </button>
          </>
        ) : (
          <p className="t-body">
            You don&rsquo;t have one yet, and you don&rsquo;t need one to look around. We&rsquo;ll
            ask for a way to reach you the first time you tell a place you&rsquo;re interested.
          </p>
        )}
      </Group>

      <Group title="Employers">
        <a href="/employer" className="btn btn-tertiary">
          I'm an organization, not a student →
        </a>
      </Group>

      <button type="button" className="btn btn-tertiary" onClick={reset}>
        Start over on this device
      </button>

      <Sheet open={sheet === 'radius'} title="How far can you travel?" onClose={() => setSheet(null)}>
        <div className="chip-wrap">
          {RADIUS_OPTIONS.map((miles) => (
            <Chip
              key={miles}
              label={radiusLabel(miles)}
              selected={student.radiusMiles === miles}
              onClick={() => {
                updateProfile({ radiusMiles: miles });
                setSheet(null);
              }}
            />
          ))}
        </div>
        <p className="t-meta">
          We work this out from the area you gave us, and we keep that separate from anything an
          organization can see.
        </p>
      </Sheet>

      <Sheet open={sheet === 'notifications'} title="Tell me about" onClose={() => setSheet(null)}>
        <div className="chip-wrap">
          {(['paid', 'internship', 'volunteer'] as OpportunityType[]).map((type) => (
            <Chip
              key={type}
              label={TYPE_LABEL[type]}
              selected={notifications.types.includes(type)}
              showTick
              onClick={() => setNotifications({ types: toggle(notifications.types, type) })}
            />
          ))}
        </div>
        <h3 className="t-sub">How often?</h3>
        <div className="chip-wrap">
          {(['immediately', 'daily', 'weekly', 'off'] as const).map((frequency) => (
            <Chip
              key={frequency}
              label={
                frequency === 'immediately'
                  ? 'Straight away'
                  : frequency === 'off'
                    ? 'Off'
                    : `${frequency[0]?.toUpperCase()}${frequency.slice(1)} summary`
              }
              selected={notifications.frequency === frequency}
              onClick={() => setNotifications({ frequency })}
            />
          ))}
        </div>
        <button type="button" className="btn btn-primary btn-block" onClick={() => setSheet(null)}>
          Done
        </button>
      </Sheet>
    </>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="section">
      <h2 className="t-section">{title}</h2>
      {children}
    </section>
  );
}

function Prompt({ heading, body }: { heading: string; body: string }) {
  return (
    <div className="fit">
      <h2 className="fit-heading">{heading}</h2>
      <p className="fit-line">{body}</p>
    </div>
  );
}
