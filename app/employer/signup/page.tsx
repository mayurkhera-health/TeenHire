'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BackButton } from '@/components/Shell';
import { Tile } from '@/components/ui';
import { useApp } from '@/lib/store';
import type { OrganizationKind } from '@/lib/types';

/* A manager should not need HR training to get through this. Five fields,
   none of them a company profile. Verification happens behind the scenes. */

export default function EmployerSignup() {
  const { setEmployerOrg } = useApp();
  const router = useRouter();
  const [kind, setKind] = useState<OrganizationKind | null>(null);
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [zip, setZip] = useState('');

  const ready =
    kind !== null &&
    name.trim() !== '' &&
    contactName.trim() !== '' &&
    email.includes('@') &&
    city.trim() !== '' &&
    /^\d{5}$/.test(zip.trim());

  const submit = () => {
    if (!ready) return;
    setEmployerOrg({
      kind,
      name: name.trim(),
      website: website.trim(),
      contactName: contactName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      city: city.trim(),
      zip: zip.trim(),
    });
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
          <Field id="your-email" label="Work email" value={email} onChange={setEmail} placeholder="sam@citrusgrove.example" type="email" />
          <Field id="your-phone" label="Phone (optional)" value={phone} onChange={setPhone} placeholder="(408) 555-0142" type="tel" />
          <Field id="org-city" label="Where students would work" value={city} onChange={setCity} placeholder="Santa Clara" />
          <Field id="org-zip" label="ZIP code" value={zip} onChange={(v) => setZip(v.replace(/\D/g, '').slice(0, 5))} placeholder="95050" />
        </div>

        <p className="t-meta">
          We check every organization by hand before anything goes live — the address, the website
          and that you are really who you say you are. Students only ever see verified places.
        </p>
      </main>

      <div className="sticky-cta">
        <button type="button" className="btn btn-primary btn-block" onClick={submit} disabled={!ready}>
          Continue
        </button>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <div className="stack gap-2">
      <label className="t-sub" htmlFor={id}>
        {label}
      </label>
      <div className="search">
        <input
          id={id}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
      </div>
    </div>
  );
}
