'use client';

import { use } from 'react';
import { BackButton, LoadingScreen } from '@/components/Shell';
import { DataError, DataLoading } from '@/components/DataError';
import { Cake, Clock, Dash, Pin, Tick } from '@/components/Icons';
import { LogoTile } from '@/components/ui';
import { INTEREST_LABEL, TIMING_LABEL } from '@/lib/copy';
import { useInterestedStudents } from '@/lib/useEmployer';

/* Two buttons, not fifteen pipeline stages. And only what an organization
   needs to decide whether to talk to someone — the server sends a first name,
   an age, a city, a rounded distance and what they have done, because that is
   the whole of §33's envelope and the query enforces it. */

export default function ApplicantsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { students, loading, error, reload, respond } = useInterestedStudents(id);

  if (loading) {
    return (
      <div className="screen">
        <main className="page gutter console">
          <BackButton />
          <DataLoading label="Loading students…" />
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="screen">
        <main className="page gutter console">
          <BackButton />
          <DataError onRetry={reload} />
        </main>
      </div>
    );
  }

  return (
    <div className="screen">
      <main className="page gutter console">
        <div className="row gap-3">
          <BackButton />
        </div>

        <header className="stack gap-2">
          <h1 className="t-greeting">Interested students</h1>
          <p className="t-sub">
            {students.length === 0
              ? 'Nobody yet'
              : `${students.length} ${students.length === 1 ? 'student' : 'students'}`}
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
              <article className="card" key={student.applicationId}>
                <div className="card-head">
                  <LogoTile name={student.firstName} type="paid" />
                  <div>
                    <h2 className="t-title">{student.firstName}</h2>
                    <p className="t-meta card-org">
                      {student.age} · {student.city}
                    </p>
                  </div>
                  <span />
                </div>

                {student.belowMinimumAge ? (
                  <p className="t-meta" style={{ color: 'var(--warn)' }}>
                    Under the minimum age you set now. They applied before you changed it.
                  </p>
                ) : null}

                <div className="meta-row">
                  <span className="meta-item">
                    <Pin />
                    {student.distanceMiles} miles away
                  </span>
                  <span className="meta-item">
                    <Clock />
                    {student.availability.map((t) => TIMING_LABEL[t]).join(', ') || 'Flexible'}
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

                {student.status === 'EMPLOYER_INTERESTED' || student.status === 'NOT_SELECTED' ? (
                  <div className="fit" data-eligible={student.status === 'EMPLOYER_INTERESTED'}>
                    <p className="fit-line">
                      {student.status === 'EMPLOYER_INTERESTED' ? (
                        <Tick size={16} />
                      ) : (
                        <Dash size={16} />
                      )}
                      {student.status === 'EMPLOYER_INTERESTED'
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
                      onClick={() => respond(student.applicationId, 'interested')}
                    >
                      I&rsquo;d like to connect
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => respond(student.applicationId, 'not_a_match')}
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
          You never see a home address, a birthday, or where exactly a student searched from.
        </p>
      </main>
    </div>
  );
}
