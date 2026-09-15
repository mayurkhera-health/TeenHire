'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BackButton } from '@/components/Shell';
import { Chip } from '@/components/ui';
import type { OrganizationKind } from '@/lib/types';

/* §35 — the cold-start tool.
 *
 * An admin creates the record on a business's behalf after a phone call or a
 * visit. No account is attached, because an organization and an organization
 * login are separate things; the business can claim it later, and claiming is
 * explicitly out of scope for now (§56). */

export default function NewOrganization() {
  const router = useRouter();
  const [kind, setKind] = useState<OrganizationKind>('business');
  const [fields, setFields] = useState({
    name: '', website: '', phone: '', contactName: '', city: '', zip: '', about: '', notes: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof typeof fields) => (value: string) =>
    setFields((current) => ({ ...current, [key]: value }));

  const ready = fields.name.trim() !== '' && fields.city.trim() !== '' && /^\d{5}$/.test(fields.zip);

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);

    const response = await fetch('/api/admin/organizations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...fields, kind, zip: fields.zip }),
    });

    if (!response.ok) {
      const detail = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(detail?.error ?? 'Could not create that organization');
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
          <span className="t-eyebrow">Admin · new organization</span>
        </div>

        <div className="question">
          <h1 className="t-display" style={{ fontSize: 30 }}>Add an organization</h1>
          <p className="t-meta">
            Created unverified, with no account attached. Verify it from the queue once the checks
            are done, and everything it is holding goes live at once.
          </p>
        </div>

        <div className="chip-wrap">
          <Chip label="Business" selected={kind === 'business'} onClick={() => setKind('business')} />
          <Chip label="Nonprofit" selected={kind === 'nonprofit'} onClick={() => setKind('nonprofit')} />
        </div>

        <div className="stack gap-4">
          <Field id="name" label="Organization name" value={fields.name} onChange={set('name')} placeholder="Westgate Cinema" />
          <Field id="website" label="Website" value={fields.website} onChange={set('website')} placeholder="westgate.example" />
          <Field id="phone" label="Phone" value={fields.phone} onChange={set('phone')} placeholder="(408) 555-0142" />
          <Field id="contact" label="Who you spoke to" value={fields.contactName} onChange={set('contactName')} placeholder="Dana Reyes" />
          <Field id="city" label="City" value={fields.city} onChange={set('city')} placeholder="San Jose" />
          <Field id="zip" label="ZIP" value={fields.zip} onChange={(v) => set('zip')(v.replace(/\D/g, '').slice(0, 5))} placeholder="95117" />
          <Field id="about" label="One line students will read" value={fields.about} onChange={set('about')} placeholder="An eight-screen neighbourhood cinema." />
          <Field id="notes" label="Internal notes (never shown to students)" value={fields.notes} onChange={set('notes')} placeholder="Met at the chamber of commerce event" />
        </div>

        {error ? <p className="t-meta" role="alert" style={{ color: 'var(--warn)' }}>{error}</p> : null}
      </main>

      <div className="sticky-cta">
        <button type="button" className="btn btn-primary btn-block" onClick={submit} disabled={!ready || busy}>
          {busy ? 'Creating…' : 'Create organization'}
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
    <div className="stack gap-2">
      <label className="t-sub" htmlFor={id}>{label}</label>
      <div className="search">
        <input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      </div>
    </div>
  );
}
