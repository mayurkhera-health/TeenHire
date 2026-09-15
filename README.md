# TeenHire

A local opportunity marketplace for high-school students. Paid jobs,
internships and volunteering near home — built around first jobs, school
schedules, limited transport and no résumé.

Mobile-first responsive web app. Next.js App Router, TypeScript, plain CSS.

### Database

The app reads opportunities from Postgres with PostGIS. It will not start
serving a feed without one — a misconfigured deployment must fail loudly
rather than quietly serving a fixture.

```bash
# one-time local cluster
initdb -D .pgdata -U postgres --auth=trust
pg_ctl -D .pgdata -o '-p 5433' start
createdb -h 127.0.0.1 -p 5433 -U postgres teenhire

cp .env.example .env
export DATABASE_URL="postgres://postgres@127.0.0.1:5433/teenhire?sslmode=disable"
npm run db:migrate
npm run db:seed
```

Managed Postgres works unchanged — nothing in the code is vendor-specific, so
where the database lives is a deploy-time decision. The one thing that matters
is distance: every page runs a PostGIS query, so a database in a different
cloud from the app pays 30–80ms on each one. Co-locate them.

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

If that page loads forever, the address is not in `allowedDevOrigins` in
`next.config.ts`. Next refuses cross-origin development requests and the
symptom is silent — the loading state renders and the client bundle never
arrives, so it reads as a hang rather than as a refusal. The private ranges a
home or office network hands out are listed there already; an unusual one has
to be added.

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

## How the read path works

`db/migrations/001_init.sql` holds the schema, `lib/repository.ts` the
queries, `app/api/opportunities/route.ts` the one endpoint every screen uses.

The database decides who is eligible — published, from a verified
organization, old enough, within range — so a row that fails any of those
never reaches the application layer and no screen or notification can surface
it by accident. That is §47's query, and PostGIS computes the distance on the
sphere rather than the app approximating it.

Ranking deliberately stayed in TypeScript. Distance and age are set
operations a database does better; the ordering rules are product decisions
pinned by tests, and moving them into SQL would have traded that coverage for
nothing.

`npm run test:db` proves the two agree. It ran the in-memory rules and the SQL
side by side across 64 profiles — four places, four radii, four ages — and got
identical result sets every time, with distances within 0.023 miles (the gap
is spherical haversine versus PostGIS's spheroidal WGS84; PostGIS is the
accurate one). Keep it passing until the in-memory path is deleted.

**A failed query is never an empty neighbourhood.** "Nothing near you" is a
conclusion about a student's town, and one who reaches it stops opening the
app. An unreachable database renders as a failure with a retry, and the
greeting count stays blank rather than reading "0 opportunities near you".
Verified by stopping Postgres and loading the feed.

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

## The admin console

`/admin`. Until it existed `PENDING_REVIEW` was a terminal state — the schema
knew how to hold a pending organization and the queries knew to hide it, but
nothing in the system could move it.

**Admin is granted, never claimed.** The role comes from `ADMIN_CONTACTS` at
sign-in and from nowhere else; a self-service path to admin would be a hole in
the one part of this product that exists to keep minors safe. Every admin
endpoint answers 404 rather than 403 to everyone else, so the console does not
confirm its own existence to a signed-in student.

**Verification releases what it was holding.** Approving an organization
publishes every posting of its that was waiting — without that an admin would
verify a business and its postings would sit in review forever, which is how
the pipeline got stuck in the first place. Suspension is the reverse and just
as complete: live postings come off the feed.

**Every decision is written down.** `audit_log` is kept apart from `events` on
purpose — events are analytics and may one day be trimmed or sampled; this is
the record of who decided an organization was safe to put in front of minors,
and it is never trimmed. Rejecting or suspending requires a reason.

**Cold start** is §35 and §36: an admin creates the organization record with
no account attached, and posts on its behalf. That posting goes through the
same draft type and the same `draftToOpportunity` the employer wizard uses —
an assisted posting and a self-service one differ by one column
(`creation_method`), never by a code path.

**Demand signals withhold small cells.** §41 says always aggregated; the floor
of five is the part the spec does not spell out and needs. In a thin market
"Saratoga · 17 · volunteer · 1 student" is a named student wearing a count.

## The marketplace loop

`§6`'s loop used to be severed in two places: an expression of interest never
left the browser it was made in, and an employer's posting never reached the
database. Both writes now exist, and the loop closes across two separate
sessions on two separate devices.

    student signs in  →  profile on the server
    employer signs in →  organization created PENDING
    employer posts    →  PENDING_REVIEW, invisible to students
    admin verifies    →  PUBLISHED, appears in the feed
    student taps      →  application row
    employer opens    →  first name, age, city, rounded distance, availability
    employer responds →  student sees EMPLOYER_INTERESTED

Every step of that is exercised by `npm run test:db` and by a browser test
that drives both halves in separate contexts.

Three properties the loop depends on, each enforced in SQL rather than in a
component that could forget:

- **A posting is never more trusted than its organization.** `statusFor` reads
  the organization's verification status, so an unverified business cannot
  reach a student however it posts.
- **A business cannot post volunteer work** (§51). Hidden in the wizard so
  nobody wastes four screens on it, refused again on the server where a
  modified request cannot get round it.
- **The employer payload cannot carry a student's location.** The privacy
  envelope is the `SELECT` list in `loadInterestedStudents`, and tests assert
  the response contains no coordinates, no contact and no ZIP.

## Accounts

There is no sign-up wall. A student browses, completes onboarding and saves
opportunities without an account, because none of that leaves the device. The
gate stands at the moment they first tap **I'm Interested** — the first time
something is sent to an adult organization on their behalf, and so the first
time identity means anything.

`lib/auth.ts` holds the port. Three routes in, all producing the same account:
Continue with Google, Continue with Apple, or a six-digit code by email or
text. No passwords — teenagers reuse weak ones everywhere, and a one-time code
is both safer and fewer taps than inventing one.

Signing out withdraws what was sent on the student's behalf. Their saved list
and preferences are device-local and stay.

### Authentication is real now

The browser stub is gone. `lib/server/auth.ts` generates the code, stores only
a peppered SHA-256 of it, compares it in constant time, and never returns it
to a caller in production — `npm run test:db` asserts that last point by
checking the response with the development flag unset.

Sessions are rows rather than self-contained tokens, so signing out actually
ends something; the cookie is `httpOnly` and carries the only copy of the
secret. Codes expire after ten minutes, attempts cap at five, a spent
challenge refuses even the code that was always correct, the resend cooldown
is enforced server-side, and contacts normalise so one person is one account.

Delivery is still missing — that is Phase 4. Until then the code is written to
the server log, and handed back in the response only when `AUTH_DEV_CODES=1`
and `NODE_ENV` is not production.

### Two decisions still open

**School Google accounts.** Districts hand out Workspace for Education
accounts. A student signing in with one gives their district admin a handle on
it and loses it at graduation — along with everything they built here. The
screen warns about it; whether to detect and refuse school domains outright is
a policy call, not a code one.

**Age still has to be asked.** Neither Google nor Apple reliably returns it,
so onboarding owns that question whichever route a student comes in through.

Real integration must also use each provider's own button assets and branding
rules. The buttons here are plain text rather than an approximation of a
trademark.

## The design system

The whole app runs on the Screen 01 system: `#EDEBE5` ground, `#FBFAF7` card,
`#0E6A57` primary, `#12332B` ink, Figtree throughout, 28px card radius, and
nothing below 13px. Tokens live in `styles/tokens.css` and `styles/welcome.css`
derives from them, so the welcome screen cannot drift from the rest.

Three departures from a literal reading of that spec, each because applying it
verbatim broke something:

**Helper grey is not used for information.** `#8A948E` measures 3.00:1 on the
card — below the 4.5:1 floor. The spec's own accessibility note lists only
`#12332B` and `#5C6B64` as passing and never claims that one does. Org names,
distances, timings and ages are facts a student needs, so `--muted` is
`#5C6B64`; `#8A948E` survives as `--helper` for text that carries nothing.

**Yellow and terracotta stay in the interface.** Screen 01 says they live only
in the illustration — but that screen has no pay figure and no volunteer
listing on it. Applied globally the rule deletes the money and volunteer
colour roles the product spec requires: orange only where money appears,
yellow only on volunteer.

**Two elevations, not one.** `0 24px 60px rgba(18,51,43,.14)` is built for a
single card on an empty ground. Repeated down a feed it turns the page to mud,
so lists use `--lift-list` — the same shadow at a weight that survives
repetition. Still one elevation per surface class.

Retired in the migration: Bricolage Grotesque, Plus Jakarta Sans and Space
Mono. The 10px mono badges could not survive the 13px floor, so `PAID JOB` and
friends now take Screen 01's field-label treatment — 13px, 600, uppercase,
0.04em — which is the same machine-ish read in the new system's own voice.

Verified across 14 screens at 390px: one font family in use, no text under
13px, no contrast failure against its actual background, no tap target under
44px, no horizontal overflow, no console errors.

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

## Opportunities coming to students

`lib/notifications.ts`. Differentiator #5 is that a student does not have to
open a search box — publishing an opportunity raises a matching event and the
students it fits hear about it.

Delivery (email, SMS, later push) is backend. What is built is the part that
decides *who* hears about *what*, and in what words, kept deliberately apart
from opportunity and application logic. `matchingEvent` runs the same rules
the feed runs, so a student can never be messaged about something the app
would then refuse to show them — too young, out of range, or from an
organization still in review all produce silence.

Tests pin the two properties most likely to break quietly: every composed
message fits one 160-character SMS segment, and no message ever contains the
student's name, ZIP or search coordinates. The organization never receives
the matched audience — the event returns notifications, not a list of minors.

## Notifications

Composition — who may hear about what, and in what words — has existed since
the first release and is covered by unit tests. Phase 4 added everything
between "we decided to say this" and "somebody's phone buzzed".

**Email goes through Resend.** The adapter is one file, `lib/server/delivery/
resend.ts`, behind a three-line `Provider` interface; nothing above the seam
knows who sends the mail. Set `NOTIFY_PROVIDER=resend`, `RESEND_API_KEY` and
`NOTIFY_FROM`, and verify that sending domain in Resend first — SPF, DKIM and
DMARC — or every send is refused. Prefer a subdomain (`mail.teenhire.com`) so
a deliverability problem with notifications cannot damage the reputation of
the domain you send real mail from.

**SMS is not wired, and this matters for one setting.** A student can choose
to hear about things "right away", which the composition layer reads as SMS.
With an email-only sender those students are sent email instead — the
frequency is what they expressed a preference about, and sending nothing
because no phone number is held would be the worst reading of that choice.
It is a deliberate degradation, not a silent one, but the setting's label
overpromises until an SMS provider exists. US texting needs 10DLC carrier
registration, which takes days to weeks and is worth starting before it
becomes the thing holding up a launch.

**Every email says how to stop it.** `List-Unsubscribe` and
`List-Unsubscribe-Post` headers give Gmail and Yahoo their own one-click
button, which they require of bulk senders, and the body carries a plain link
for the fifteen-year-old reading on a phone who will never find the chrome
widget. The link carries a signed token rather than a session, because it is
followed from a mail client by someone who is not logged in — and the only
thing that signature authorises is switching notifications off. Following it
shows a confirmation page rather than unsubscribing on sight: mail scanners
prefetch links, and the first thing to open one is often a robot.

The guard matters more than the interface. `NOTIFY_PROVIDER` has no default in
production and the app refuses to start with the development sender there.
`AUTH_SECRET` already works this way, and the case is sharper here: a missing
secret fails loudly on the first request, whereas a logging sender fails
silently forever and every screen still looks fine.

**Preferences moved to the server.** They lived in `localStorage`, which was
fine while nothing sent anything — the browser was the only thing that read
them. A server-side sender cannot see `localStorage`, so "off means off" would
have been violated by the first real send. They are columns on `students` now,
written through on change and carried up at sign-in.

**Who hears about a new posting** is `lib/server/audience.ts`. It returns
notifications, never people: the moment "which students match this posting"
becomes something an employer can ask for, the privacy envelope is gone. The
eligibility gates run twice — once in SQL, once through `evaluateFit` — and
anything the two disagree about is not sent. A student must never be told
about something the app would then refuse to show them, and that property is
asserted against the feed's own query rather than against this module's idea
of who qualifies.

**Sending** is `lib/server/notify.ts` and the worker in
`scripts/notify-worker.ts`. Every message is written down before it is tried,
so a process that dies mid-send loses nothing, and `dedupe_key` is unique, so
a retried trigger cannot produce a second copy. Transient failures back off
over about an hour and then stop; a permanent failure is not retried at all.

```bash
npm run notify:work        # one pass
npm run notify:work -- 30  # a pass every 30 seconds
```

The worker is a script rather than a timer inside the web process. A web
process that also sends mail sends nothing while it is being deployed, and
sends everything twice when two instances are running.

**What is not built:** the employer never gets a message saying a student
applied — they see it on their dashboard when they next look. Digest sending
(`summaryFor` composes them; nothing schedules them) is not wired either. Both
are deliberate: neither blocks the loop, and both would have meant writing new
copy rather than delivering copy that already exists.

## The journey test

Every other suite tests one layer. SQL against TypeScript, server properties,
delivery properties, pure composition — all of them were green while a real
notification read "New weekends job Right here from you", and while two labels
on one screen ran together into "YesWe'll mention it". Both were found by a
person looking at the product, which is not something that runs twice.

`npm run test:journey` is that person, written down. It drives a student, an
employer and an admin through the whole loop in a browser at 390px, against a
real database, with no fixtures and no backdoors:

- a new arrival reaches the welcome screen, not a login
- onboarding and browsing finish with no account and no session cookie
- the gate stands at the first thing that leaves the device
- the one-time code is read off the screen, the way a student reads it out of
  their inbox — not from a log or the database
- an employer signs up, posts, and is told their posting is in review
- an admin verifies the organization, and the held posting goes live without
  anyone reposting it
- the posting reaches the student's feed
- the employer sees a first name and never the address, ZIP or coordinates
- the employer says yes, and the student is told

It needs a dev server, because the panel that shows the one-time code renders
only when `NODE_ENV` is not production — a production build has no way in and
should have none.

```bash
npm run dev -- -p 3800          # in one shell
npm run test:journey            # in another
```

It found two things on its first complete run. A signed-out admin visiting the
console was told their address "needs to be on the admin list before you sign
in", on a screen with nothing to sign in with — a dead end an ops person hits
on their first day. And the cross-origin refusal above, which had been
breaking the documented phone-testing flow silently.

## Acceptance measurements

§47 sets UX targets. Measured against the running build at 390×844:

| Target | Measured |
| --- | --- |
| Useful opportunities within ~60s of first visit | 10 taps, no typing beyond a name and a ZIP |
| Express interest in under ~30s | 4 taps |
| Employer posts in under ~2 min | 12 taps |
| Age, distance, schedule, pay, experience understood without scrolling | all 8 facts of §44 above the fold, eligibility panel at 622px of 844 |

The tap counts are the honest figure; wall-clock timings from a script say
more about the machine than about a student.

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

Also out of V1 by design: messaging, notification *delivery*, the admin
console, payments, verified volunteer hours, and any student profile shaped
like a résumé. Voice, paste and URL posting are not built either, but every
creation route already funnels through one draft and one `draftToOpportunity`
(`lib/opportunityDraft.ts`), so adding one cannot grow a second opportunity
model behind it.

Nothing in the UI shows a number the data cannot support. If you add one, make
it survive the question an employer or a student would ask of it: where did
that come from?
