# TeenHire

A local opportunity marketplace for high-school students. Paid jobs,
internships and volunteering near home — built around first jobs, school
schedules, limited transport and no résumé.

Mobile-first responsive web app. Next.js App Router, TypeScript, plain CSS.

```bash
npm install
npm run dev        # http://localhost:3000
npm run dev:lan    # also reachable from a phone on the same Wi-Fi
npm run build
npm run typecheck
npm test
```

### Testing on a real phone

Worth doing rather than relying on device emulation: the bottom nav and the
sticky CTA size themselves with `env(safe-area-inset-bottom)`, which only has
a real value on a physical device, and the thumb-zone rule cannot be checked
with a mouse.

```bash
npm run dev:lan
ipconfig getifaddr en0   # macOS, Wi-Fi — your Mac's address on the network
```

Open `http://<that-address>:3000` on the phone, same Wi-Fi. Add it to the home
screen to see it without browser chrome, which is how it was designed to be
read.

No database and no API keys. Everything runs from seeded data and the
student's own device.

---

## What's in here

**Student**
- Welcome → five onboarding questions → feed, in about a minute. No account,
  no sign-in wall, nothing to complete before seeing value.
- Discover: greeting and count, search, four filters, and three to five named
  sections of two to four cards each — *Close to you*, *Works with your
  schedule*, *Good first jobs*, *New this week*, *Volunteer near you*.
- Opportunity detail with the eligibility panel, then *What you'll do*, *When
  you'd work*, *Who can apply*, *About this place*, *Location*, *Good to know*.
- I'm Interested: one optional sentence, one just-in-time profile question,
  send. No cover letter, no application form.
- Saved, Activity (with plain-language statuses) and Me.

**Organization**
- Signup: organization kind plus four fields.
- Console: what's open, who's interested.
- Posting: five questions, with the student-facing card rendered live on the
  last step before anything is submitted. Postings queue for review — nothing
  publishes itself.
- Interested students as cards, two decisions, and only the fields an
  organization needs: first name, age, rough distance, availability, interests.

---

## How matching works

`lib/matching.ts`. Deterministic, explainable, no model and no score. Every
line the eligibility panel shows was produced by a rule that actually ran.

Filters (the shape of the eventual SQL — `minimum_age <= student_age AND
distance <= student_radius`, plus published and verified):

1. Published, from a verified organization
2. Age eligible
3. Inside the student's travel radius

Ranking, each step a tie-break on the one above it:

1. Eligibility
2. Opportunity type the student asked for
3. Availability overlap
4. Interest overlap
5. Distance
6. Freshness

Nothing in the UI ever shows a percentage, a match score or a profile
completion bar.

### Three judgement calls in the rules, and why

**Availability never blocks.** The design spec says the fit panel flips to its
warning state if *any* rule fails. Age and distance are things the platform can
assert; whether a student can make a shift on a given Saturday is not. A
schedule mismatch shows as an unticked line and nothing more.

**Experience is described as something the role wants,** never as something the
student lacks — "They're looking for someone who has done this before", not
"You don't have enough experience". It blocks only when the posting genuinely
requires it.

**An ineligible student is never locked out.** On a posting they don't qualify
for, *I'm Interested* stops being the leading action — the primary button
becomes *Find ones I can do* — but it stays on the screen as a tertiary link.
The rules can be wrong, and being refused by software is worse than being
refused by a person.

---

## Design system

`styles/tokens.css` carries the palette, type, 4px scale, radii, elevation and
motion as CSS custom properties. `components.css` is the component set;
nothing outside it is a component.

- **Teal is the only action colour. Orange appears only where money appears.
  Yellow only on volunteer.** A screen needing a fourth accent is a screen that
  needs redesigning.
- Bricolage Grotesque for anything read first, Plus Jakarta Sans for anything
  explanatory, Space Mono (10–12px only) for badges, counters and eyebrows.
- Three type badges and one trust badge. That's the whole badge vocabulary.
- Photography is optional and never load-bearing — every card and detail screen
  reads correctly with no image at all, falling back to 45° striped placeholders
  tinted by opportunity type.

Verified in a real browser at 320px, 390px and 900px:

- 44×44px minimum hit target across the feed, with zero exceptions
- All body text at 4.5:1 or better against its actual background
- Selection never signalled by colour alone — weight shifts and a tick
- 200% type scale with no clipping and no horizontal overflow
- All motion disabled under `prefers-reduced-motion`
- Two-column grid and top nav from 640px; detail CTA inline on pointer devices

---

## Deliberate departures from the spec

- **Interests and transport are optional sub-questions, not their own screens.**
  The spec asks for a five-bar onboarding rail *and* seven questions. Both
  optional ones ride along with the question they relate to, which keeps the
  rail honest at five.
- **"See all" expands its section in place** rather than routing to a section
  page — a route that would have shown the same cards with a different heading.
- **The employer console shows sample listings from other organizations,**
  clearly labelled, so the interested-students view is reachable before you
  have applicants of your own.
- **Organizations in the seed data are invented.** None of these postings are
  real, and none are attributed to a real company.

## Deploying

The app is a Next.js server with no database, no environment variables and no
secrets, so anywhere that runs Node will host it.

**Fly.io** — `Dockerfile` and `fly.toml` are in the repo:

```bash
fly launch --no-deploy   # decline when it offers to overwrite either file
fly deploy
```

The Dockerfile exists rather than being generated because `output: 'standalone'`
emits the server without `.next/static`. A generated Dockerfile that misses
that copy step deploys a site that renders with no CSS and no obvious cause.

`fly.toml` suspends the machine when idle and resumes on the next request,
which is appropriate for something holding no server-side state. Set
`min_machines_running = 1` if a pause on the first visit would spoil a demo.

Nothing about the app requires a container — it is entirely client-side today,
so a static host serves it just as well and more cheaply. The container is
worth it once the FastAPI service lands and both halves want the same home.

## The welcome illustration

`components/WelcomeHero.tsx` is drawn rather than photographed. A photograph
of five teenagers picks five specific teenagers, and on the screen that
answers "is this for someone like me", everyone who does not see themselves in
it gets a quieter answer. Drawn figures say "people your age" without saying
"people like these" — which is why the five differ in skin tone, hair and
dress rather than being one silhouette recoloured.

Imagery is the single exemption from the accent rule. Teal-only-for-action
governs the interface; a picture obeying it would be a picture of the
interface, and a photograph would carry every colour too.

To use a photo instead: drop it at `public/hero.jpg` and set `HERO_PHOTO` at
the top of that file. It fills the same frame at the same radius. Pick one
where students are doing the work rather than posing — posed group shots are
the visual signature of a school district brochure, which is the one thing
§59 of the product spec asks the product not to look like.

## The thin market

Every market is thin on its first day, so the greeting treats that as the
default case rather than the edge. `lib/greeting.ts` holds the ladder:

| In range | Line |
| --- | --- |
| 0 | *Nothing within 3 miles yet* — the empty panel below carries the count and the action, so no number is said twice |
| 1–2, more further out | *2 within 5 miles, and 10 more just past that*, with a one-tap **Look 10 miles out** |
| 1–2, nothing further out | *2 near you right now* |
| 3+ | *16 opportunities near you* |

Below three, a bare total stops reading as a selection and starts reading as
scraps, which is how a student decides the app is not worth opening again.
The line switches from reporting a number to pointing at the move that helps.

Everything it says comes from what the feed knows — how many are in range, and
how many sit between here and the next radius up. It never says "more added
every week" or "check back soon": there is no data behind either, and a thin
market is exactly where that would be most tempting to write. `npm test`
pins both properties.

Widening from the greeting writes to the student's profile rather than to
component state, so the change survives a reload.

## Reach, and why it shows no number

`lib/reach.ts`. The posting flow's last step is where an employer decides
whether to commit, which makes it the worst possible place to print an
invented figure. There is no student base to count yet, so `reachFor` returns
`{ known: false }` and the screen tells the employer what their own settings
do instead — "Students aged 15 and 16 will not see this" — which is true by
construction whatever the eventual population turns out to be.

Both branches are already rendered. Wiring this to real counts before launch
means returning `{ known: true, count }` from one function; the SQL it stands
in for is written out in the file.

## Not built

No backend. Matching, distance and eligibility run client-side over seeded
data; profile, saves and interests live in `localStorage`. The module
boundaries (`lib/matching.ts`, `lib/geo.ts`, `lib/store.tsx`) are drawn where
the FastAPI + PostGIS service would slot in, so that becomes a change of data
source rather than a change of screens.

Also out of V1 by design: messaging, notifications delivery, the admin console,
payments, and any student profile shaped like a résumé.

Nothing in the UI shows a number the data cannot support. If you add one, make
it survive the question an employer or a student would ask of it: where did
that come from?
