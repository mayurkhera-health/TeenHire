'use client';

import { notFound } from 'next/navigation';
import { use } from 'react';
import { BackButton, LoadingScreen } from '@/components/Shell';
import { Cake, Clock, Pin, Tick, Dash } from '@/components/Icons';
import { LogoTile, TypeBadge } from '@/components/ui';
import { INTEREST_LABEL, TIMING_LABEL, timingPhrase } from '@/lib/copy';
import { useApp } from '@/lib/store';

/* Two buttons, not fifteen pipeline stages. And only what an organization
   needs to decide whether to talk to someone: a first name, an age, roughly
   how far away, when they are free. No address, no birth date, no surname. */

export default function ApplicantsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { ready, opportunities, organizations, applicantsFor, decideApplicant, employerOrg } = useApp();

  if (!ready) return <LoadingScreen />;

  const opportunity = opportunities.find((o) => o.id === id);
  if (!opportunity) notFound();

  const organization = organizations.find((o) => o.id === opportunity.organizationId);
  const organizationName = organization?.name ?? employerOrg?.name ?? 'Your organization';
  const students = applicantsFor(id);

  return (
    <div className="screen">
      <main className="page gutter console">
        <div className="row gap-3">
          <BackButton />
          <TypeBadge type={opportunity.type} />
        </div>

        <header className="stack gap-2">
          <h1 className="t-greeting">{opportunity.title}</h1>
          <p className="t-sub">
            {students.length === 0
              ? 'No students yet'
              : `${students.length} ${students.length === 1 ? 'student' : 'students'} interested`}
          </p>
          <p className="t-meta">
            {organizationName} · {opportunity.minimumAge}+ · {timingPhrase(opportunity.timing)}
          </p>
        </header>

        {students.length === 0 ? (
          <div className="panel-ink">
            <h2 className="t-section" style={{ color: '#fff' }}>
              Nobody yet
            </h2>
            <p className="t-body">
              Postings that accept 15- and 16-year-olds and need no experience fill up fastest.
            </p>
          </div>
        ) : (
          <div className="card-list" data-grid="true">
            {students.map((student) => (
              <article className="card" key={student.id}>
                <div className="card-head">
                  <LogoTile name={student.firstName} type={opportunity.type} />
                  <div>
                    <h2 className="t-title">{student.firstName}</h2>
                    <p className="t-meta card-org">
                      {student.age} · {student.city}
                    </p>
                  </div>
                  <span />
                </div>

                <div className="meta-row">
                  <span className="meta-item">
                    <Pin />
                    {student.distanceMiles} miles away
                  </span>
                  <span className="meta-item">
                    <Clock />
                    {student.availability.map((t) => TIMING_LABEL[t]).join(', ')}
                  </span>
                  <span className="meta-item">
                    <Cake />
                    {student.experience}
                  </span>
                </div>

                {student.thingsDone.length > 0 ? (
                  <div className="stack gap-2">
                    <span className="t-mono" style={{ color: 'var(--muted)' }}>
                      Things they&rsquo;ve done
                    </span>
                    <div className="chip-wrap">
                      {student.thingsDone.map((thing) => (
                        <span key={thing} className="badge type-paid">
                          {thing}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {student.interests.length > 0 ? (
                  <p className="t-meta">
                    Interests: {student.interests.map((i) => INTEREST_LABEL[i]).join(' · ')}
                  </p>
                ) : null}

                {student.note ? <p className="t-body">“{student.note}”</p> : null}

                {student.decision ? (
                  <div className="fit" data-eligible={student.decision === 'interested'}>
                    <p className="fit-line">
                      {student.decision === 'interested' ? <Tick size={16} /> : <Dash size={16} />}
                      {student.decision === 'interested'
                        ? `We've let ${student.firstName} know you'd like to speak.`
                        : `${student.firstName} has been moved out of this list.`}
                    </p>
                  </div>
                ) : (
                  <div className="sticky-cta-row">
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ flex: 1 }}
                      onClick={() => decideApplicant(student.id, 'interested')}
                    >
                      I'd like to connect
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => decideApplicant(student.id, 'not_a_match')}
                    >
                      Not this time
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}

        <p className="t-meta">
          Students see a message tied to this opportunity — never a direct message out of the blue.
        </p>
      </main>
    </div>
  );
}
