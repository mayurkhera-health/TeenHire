'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AccountGate } from '@/components/AccountGate';
import { BackButton } from '@/components/Shell';
import { Tile } from '@/components/ui';
import { useApp } from '@/lib/store';
import type { OrganizationKind } from '@/lib/types';

/* Organization signup, in two parts that the spec keeps carefully separate.
 *
 * First: who is this person. Same one-time code the students use — one auth
 * mechanism, one set of properties to keep right.
 *
 * Second: what organization do they say they represent. That question is not
 * answered by this form and cannot be. The record is created PENDING and a
 * human decides. §34's checks are what turn it into VERIFIED, and until then
 * nothing this organization posts reaches a student. */

export default function EmployerSignup() {
  const { ready, signedIn } = useApp();
  const router = useRouter();

  const [kind, setKind] = useState<OrganizationKind | null>(null);
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [zip, setZip] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!ready) {
    return (
      <div className="screen">
        <main className="page gutter console">
          <p className="t-meta" role="status">One moment…</p>
        </main>
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className="screen">
        <main className="page gutter console">
          <div className="row gap-3">
            <BackButton />
            <span className="t-eyebrow">Post an opportunity</span>
          </div>
          <AccountGate onDone={() => router.refresh()} />
        </main>
      </div>
    );
  }

  const ready4 =
    kind !== null && name.trim() !== '' && contactName.trim() !== '' && city.trim() !== '' && /^\d{5}$/.test(zip);

  const submit = async () => {
    if (!ready4 || busy) return;
    setBusy(true);
    setError(null);

    const response = await fetch('/api/employer/organization', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        kind,
        website: website.trim(),
        phone: phone.trim(),
        contactName: contactName.trim(),
        city: city.trim(),
        zip,
      }),
    });

    if (!response.ok) {
      const detail = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(detail?.error ?? 'Could not create your organization');
      setBusy(false);
      return;
    }

    router.replace('/employer');
  };

  return (
    <div className="screen">
      <main className="page gutter console">
        <div className="row gap-3">
          <BackButton />
          <span className="t-eyebrow">Post an opportunity</span>
        </div>

        <div className="question">
          <h1 className="t-display">What kind of organization are you?</h1>
          <p className="t-meta">
            Volunteer postings are for nonprofit and community organizations. A business can still
            post paid work and internships.
          </p>
        </div>

        <div className="answers">
          <Tile
            label="Business"
            note="Shops, restaurants, studios, clinics"
            selected={kind === 'business'}
            onClick={() => setKind('business')}
          />
          <Tile
            label="Nonprofit"
            note="Charities, community and service organizations"
            selected={kind === 'nonprofit'}
            onClick={() => setKind('nonprofit')}
          />
        </div>

        <div className="stack gap-4">
          <Field id="org-name" label="Organization name" value={name} onChange={setName} placeholder="Citrus Grove Smoothies" />
          <Field id="org-site" label="Website (optional)" value={website} onChange={setWebsite} placeholder="citrusgrove.example" />
          <Field id="your-name" label="Your name" value={contactName} onChange={setContactName} placeholder="Sam Ortega" />
          <Field id="your-phone" label="Phone (optional)" value={phone} onChange={setPhone} placeholder="(408) 555-0142" type="tel" />
          <Field id="org-city" label="Where students would work" value={city} onChange={setCity} placeholder="Santa Clara" />
          <Field id="org-zip" label="ZIP code" value={zip} onChange={(v) => setZip(v.replace(/\D/g, '').slice(0, 5))} placeholder="95050" />
        </div>

        {error ? <p className="t-meta" role="alert" style={{ color: 'var(--warn)' }}>{error}</p> : null}

        <p className="t-meta">
          We check every organization by hand before anything goes live — the address, the website
          and that you are really who you say you are. Students only ever see verified places.
        </p>
      </main>

      <div className="sticky-cta">
        <button type="button" className="btn btn-primary btn-block" onClick={submit} disabled={!ready4 || busy}>
          {busy ? 'Creating…' : 'Continue'}
        </button>
      </div>
    </div>
  );
}

function Field({
  id, label, value, onChange, placeholder, type = 'text',
}: {
  id: string; label: string; value: string;
  onChange: (value: string) => void; placeholder: string; type?: string;
}) {
  return (
    <div className="stack gap-2">
      <label className="t-sub" htmlFor={id}>{label}</label>
      <div className="search">
        <input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      </div>
    </div>
  );
}
