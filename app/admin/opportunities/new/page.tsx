'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BackButton } from '@/components/Shell';
import { Chip } from '@/components/ui';
import { EMPLOYER_TIMING, TIMING_LABEL } from '@/lib/copy';
import { compensationFrom, type OpportunityDraft } from '@/lib/opportunityDraft';
import type { AdminOrg } from '@/lib/useAdmin';
import type { Experience, MinimumAge, OpportunityType, Timing } from '@/lib/types';

/* §36 — "tell us what you're looking for, we'll take care of the posting".
 *
 * Denser than the employer wizard on purpose: an admin doing ten of these
 * after a morning of phone calls wants one screen, not five. What it produces
 * is the identical draft the wizard produces, through the identical
 * converter — the two differ by a column, never by a code path. */

const AGES: MinimumAge[] = [15, 16, 17, 18];
const EXPERIENCES: { value: Experience; label: string }[] = [
  { value: 'none', label: 'First job is fine' },
  { value: 'some', label: 'Some experience preferred' },
  { value: 'required', label: 'Experience required' },
];

export default function NewOpportunity() {
  const router = useRouter();
  const [organizations, setOrganizations] = useState<AdminOrg[]>([]);
  const [organizationId, setOrganizationId] = useState('');
  const [type, setType] = useState<OpportunityType>('paid');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [minimumAge, setMinimumAge] = useState<MinimumAge>(16);
  const [experience, setExperience] = useState<Experience>('none');
  const [timing, setTiming] = useState<Timing[]>([]);
  const [payMin, setPayMin] = useState('');
  const [payMax, setPayMax] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const response = await fetch('/api/admin/organizations');
      if (!response.ok) return;
      const data = (await response.json()) as { organizations: AdminOrg[] };
      setOrganizations(data.organizations);
      setOrganizationId((current) => current || data.organizations[0]?.id || '');
    })();
  }, []);

  const org = organizations.find((o) => o.id === organizationId);
  /* §51 again. A business cannot be given a volunteer posting even by an
     admin — the override is to correct the organization's kind on the record,
     which is auditable, not to slip one through here. */
  const canVolunteer = org?.kind !== 'business';

  const compensation = compensationFrom({
    type, payMin, payMax, internshipPay: type === 'internship' ? 'paid' : null,
    stipend: '', commitment: type === 'volunteer' ? 'weekly' : null,
  });

  const ready = organizationId !== '' && title.trim() !== '' && timing.length > 0 && compensation !== null;

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);

    const draft: OpportunityDraft = {
      source: 'form', type, title, summary, minimumAge, experience, timing,
      hours: null, compensation,
    };

    const response = await fetch('/api/admin/opportunities', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ organizationId, draft, internalNotes: notes || null }),
    });

    if (!response.ok) {
      const detail = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(detail?.error ?? 'Could not create that posting');
      setBusy(false);
      return;
    }
    router.replace('/admin');
  };

  return (
    <div className="screen">
      <main className="page gutter console" style={{ maxWidth: 'var(--max-console)' }}>
        <div className="row gap-3">
          <BackButton />
          <span className="t-eyebrow">Admin · post on their behalf</span>
        </div>

        <div className="question">
          <h1 className="t-display" style={{ fontSize: 30 }}>Post for an organization</h1>
          <p className="t-meta">
            {org?.verificationStatus === 'VERIFIED'
              ? 'This organization is verified, so the posting goes live immediately.'
              : 'This organization is not verified yet, so the posting waits with it.'}
          </p>
        </div>

        <div className="stack gap-3">
          <label className="t-sub" htmlFor="org">Organization</label>
          <div className="chip-wrap">
            {organizations.map((o) => (
              <Chip
                key={o.id}
                label={`${o.name}${o.verificationStatus === 'VERIFIED' ? '' : ' (unverified)'}`}
                selected={organizationId === o.id}
                onClick={() => setOrganizationId(o.id)}
              />
            ))}
          </div>
          <input id="org" type="hidden" value={organizationId} readOnly />
        </div>

        <div className="stack gap-3">
          <h2 className="t-section">What are they offering?</h2>
          <div className="chip-wrap">
            <Chip label="Paid job" selected={type === 'paid'} onClick={() => setType('paid')} />
            <Chip label="Internship" selected={type === 'internship'} onClick={() => setType('internship')} />
            {canVolunteer ? (
              <Chip label="Volunteer" selected={type === 'volunteer'} onClick={() => setType('volunteer')} />
            ) : null}
          </div>
          {!canVolunteer ? (
            <p className="t-meta">
              Volunteer is unavailable for a business. If this really is voluntary work, change the
              organization&rsquo;s kind on its record first — that decision gets logged.
            </p>
          ) : null}
        </div>

        <div className="stack gap-4">
          <Field id="title" label="Title" value={title} onChange={setTitle} placeholder="Evening Box Office" />
          <Field id="summary" label="One sentence students will read" value={summary} onChange={setSummary} placeholder="Sell tickets and help people find their screen." />
        </div>

        <div className="stack gap-3">
          <h2 className="t-section">Who can do it?</h2>
          <div className="chip-wrap">
            {AGES.map((age) => (
              <Chip key={age} label={`${age}+`} selected={minimumAge === age} onClick={() => setMinimumAge(age)} />
            ))}
          </div>
          <div className="chip-wrap">
            {EXPERIENCES.map((e) => (
              <Chip key={e.value} label={e.label} selected={experience === e.value} onClick={() => setExperience(e.value)} />
            ))}
          </div>
        </div>

        <div className="stack gap-3">
          <h2 className="t-section">When?</h2>
          <div className="chip-wrap">
            {EMPLOYER_TIMING.map((t) => (
              <Chip
                key={t}
                label={TIMING_LABEL[t]}
                selected={timing.includes(t)}
                showTick
                onClick={() =>
                  setTiming((current) =>
                    current.includes(t) ? current.filter((x) => x !== t) : [...current, t],
                  )
                }
              />
            ))}
          </div>
        </div>

        {type !== 'volunteer' ? (
          <div className="row gap-3">
            <Field id="pay-min" label="Pay from ($/hr)" value={payMin} onChange={(v) => setPayMin(v.replace(/[^\d.]/g, ''))} placeholder="20" />
            <Field id="pay-max" label="To (optional)" value={payMax} onChange={(v) => setPayMax(v.replace(/[^\d.]/g, ''))} placeholder="22" />
          </div>
        ) : (
          <p className="t-meta">Recorded as a weekly commitment. Refine it later if needed.</p>
        )}

        <Field id="notes" label="Internal notes (never shown to students)" value={notes} onChange={setNotes} placeholder="Called Dana on the 14th, wants two students" />

        {error ? <p className="t-meta" role="alert" style={{ color: 'var(--warn)' }}>{error}</p> : null}
      </main>

      <div className="sticky-cta">
        <button type="button" className="btn btn-primary btn-block" onClick={submit} disabled={!ready || busy}>
          {busy ? 'Creating…' : 'Create posting'}
        </button>
      </div>
    </div>
  );
}

function Field({
  id, label, value, onChange, placeholder,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <div className="stack gap-2" style={{ flex: 1 }}>
      <label className="t-sub" htmlFor={id}>{label}</label>
      <div className="search">
        <input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      </div>
    </div>
  );
}
