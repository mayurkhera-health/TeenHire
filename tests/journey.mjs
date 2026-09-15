import { chromium } from 'playwright';

/* The marketplace loop, end to end, through the interface.
 *
 * Every other suite tests one layer: SQL against TypeScript, server properties,
 * delivery properties, pure composition. All of them were green while a real
 * message read "New weekends job Right here from you" and while two labels on
 * one screen ran together into "YesWe'll mention it". Both were found by a
 * person looking at the product, which is not a repeatable test.
 *
 * This is that person, written down. It drives a student and an employer
 * through the whole thing in a browser at phone width, with no fixtures and no
 * backdoors — the one-time code is read off the screen the same way a student
 * reads it out of their inbox.
 *
 * Runs against `next dev`. That is deliberate rather than convenient: the
 * development panel that shows the code only renders when NODE_ENV is not
 * production, so a production build has no path in and should have none. */

/* Deliberately the IP rather than localhost. Next refuses cross-origin
   development requests, and an address other than the one the dev server was
   started on is cross-origin — which is how a phone on the same Wi-Fi,
   following the README, met a page that loaded forever. allowedDevOrigins in
   next.config.ts fixes it, and running this journey over an IP is what keeps
   it fixed. */
const BASE = process.env.JOURNEY_URL ?? 'http://127.0.0.1:3800';
const RUN = Date.now().toString(36);
const STUDENT = `journey-student-${RUN}@example.com`;
const EMPLOYER = `journey-employer-${RUN}@example.com`;
const ADMIN = process.env.ADMIN_CONTACT ?? 'ops@teenhire.example';
const ORG = `Journey Cafe ${RUN}`;

let failures = 0;
const check = (name, ok, detail = '') => {
  if (ok) console.log(`ok   ${name}`);
  else { failures++; console.log(`FAIL ${name} ${detail}`); }
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium',
  channel: 'chromium',
  args: ['--no-proxy-server'],
});

/* A phone, because that is what a sixteen-year-old is holding. */
async function person(label) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => {
    failures++;
    console.log(`FAIL ${label} threw in the browser: ${error.message}`);
  });
  page.setDefaultTimeout(30_000);
  return { context, page };
}

/* The account gate, from either side of the product. The code is read off the
   screen rather than out of a log or the database — if a student could not do
   it this way, neither should this test. */
async function signIn(page, contact) {
  await page.getByRole('button', { name: 'Email', exact: true }).click();
  await page.locator('#contact').fill(contact);
  await page.getByRole('button', { name: 'Send me a code' }).click();

  const panel = page.locator('.fit', { hasText: 'Development only' });
  await panel.waitFor();
  const shown = await panel.textContent();
  const code = shown.match(/\b(\d{6})\b/)?.[1];
  if (!code) throw new Error(`no code on screen: ${shown}`);

  await page.locator('#code').fill(code);
  await page.getByRole('button', { name: /^(Create my account|Continue|Verify)/ }).click();
}

// ── The student ────────────────────────────────────────────────────────────

let opportunityTitle = '';

const student = await person('student');
{
  const { page } = student;

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForURL('**/start', { timeout: 60_000 });
  check('a new arrival lands on the welcome screen, not a login', true);

  await page.locator('#first-name').fill('Priya');
  /* The label uses a typographic apostrophe, so it is matched loosely.
     A test that pins smart punctuation breaks on a copy edit that did
     nothing wrong. */
  await page.getByRole('button', { name: /Let.s go/ }).click();

  await page.waitForURL('**/onboarding/1');
  await page.getByRole('button', { name: '16', exact: true }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.waitForURL('**/onboarding/2');
  await page.locator('input[placeholder="95050"]').fill('95050');
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.waitForURL('**/onboarding/3');
  await page.getByRole('button', { name: '10 miles' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.waitForURL('**/onboarding/4');
  await page.getByRole('button', { name: 'Earn money' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.waitForURL('**/onboarding/5');
  await page.getByRole('button', { name: 'Weekends' }).click();
  await page.getByRole('button', { name: /Show me what.s near me/ }).click();

  await page.waitForURL('**/discover');
  await page.waitForTimeout(1200);

  /* Nothing so far has asked for an account. That is the deferred-registration
     bet: the gate stands at the first thing that leaves the device, not at the
     front door. */
  const cookies = await student.context.cookies();
  check('browsing and onboarding needed no account',
    !cookies.some((c) => c.name === 'th_session'));

  const cards = page.locator('article.card');
  const count = await cards.count();
  check('the feed has something in it', count > 0, `${count} cards`);
  if (count === 0) throw new Error('nothing to apply to — is the fixture seeded?');

  /* Into the one posting this journey will use. Picking the first eligible
     card rather than a known id keeps the test honest about what the feed
     actually offers. */
  await cards.first().getByRole('link', { name: 'View' }).click();
  await page.waitForURL('**/opportunity/**');
  opportunityTitle = (await page.locator('h1').first().textContent()).trim();
  check('a card opens its own detail screen', opportunityTitle.length > 0, opportunityTitle);

  await page.getByRole('link', { name: /I.m Interested/ }).click();
  await page.waitForURL('**/interest/**');

  /* The gate. This is the first thing that leaves the device, and the first
     time an account is asked for. */
  await page.getByRole('button', { name: 'Send me a code' }).waitFor();
  check('the account gate stands here and not earlier', true);

  await signIn(page, STUDENT);
  await page.waitForTimeout(1500);

  const afterSignIn = await student.context.cookies();
  check('signing in with a code creates a session',
    afterSignIn.some((c) => c.name === 'th_session' && c.httpOnly));

  await page.getByRole('button', { name: /Send My Interest/ }).click();
  await page.waitForTimeout(2000);
  check('the interest is confirmed on screen',
    await page.getByText(/^Sent to /).isVisible());

  await page.goto(`${BASE}/activity`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  check('and it appears under Activity', await page.getByText('Interest sent').isVisible());
}

// ── The employer ───────────────────────────────────────────────────────────

const employer = await person('employer');
{
  const { page } = employer;

  await page.goto(`${BASE}/employer/signup`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await signIn(page, EMPLOYER);
  await page.waitForTimeout(1500);

  await page.getByRole('button', { name: 'Business' }).click();
  await page.locator('#org-name').fill(ORG);
  await page.locator('#your-name').fill('Sam Ortega');
  await page.locator('#org-city').fill('Santa Clara');
  await page.locator('#org-zip').fill('95050');
  await page.getByRole('button', { name: /Create|Continue|Done|Finish/ }).last().click();
  await page.waitForURL('**/employer**', { timeout: 30_000 });
  await page.waitForTimeout(1200);

  /* Five questions, which is the promise the posting flow makes. */
  await page.goto(`${BASE}/employer/post/1`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Paid job' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.waitForURL('**/employer/post/2');
  await page.locator('#title').fill('Journey Barista');
  await page.locator('#summary').fill('Make drinks and keep the counter moving.');
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.waitForURL('**/employer/post/3');
  await page.getByRole('button', { name: '16+' }).click();
  await page.getByRole('button', { name: /No — first job is fine|No experience/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.waitForURL('**/employer/post/4');
  await page.getByRole('button', { name: 'Weekends' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.waitForURL('**/employer/post/5');
  await page.locator('#pay-min').fill('19');
  await page.locator('#pay-max').fill('23');

  /* §30: the employer sees the exact card a student will see, before
     anything is submitted. */
  check('the employer is shown the student-facing card before posting',
    await page.getByText('Here is what students will see').isVisible());

  await page.getByRole('button', { name: /Post Free/ }).click();
  await page.waitForURL('**/employer?posted=1', { timeout: 30_000 });
  await page.waitForTimeout(1000);

  /* An unverified organization is told the truth: it is queued, not live. */
  check('a new organization is told its posting is in review',
    await page.getByText(/Sent for review/).isVisible());
  check('and the posting is not live yet',
    await page.getByText('In review').first().isVisible());
}

// ── The admin, who is the reason any of it reaches a student ───────────────

const admin = await person('admin');
{
  const { page } = admin;
  await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  /* An ops person's first day. This used to be a dead end: the screen said
     the address had to be on the admin list "before you sign in", and offered
     nowhere to sign in. */
  check('a signed-out admin can sign in from the console',
    await page.getByRole('button', { name: 'Send me a code' }).isVisible());
  await signIn(page, ADMIN);
  await page.waitForTimeout(2000);
  await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const row = page.locator('.admin-row', { hasText: ORG }).first();
  await row.waitFor();
  check('the new organization is waiting in the console', true);
  check('and the console says how many postings are held behind it',
    /1 posting waiting on this/.test(await row.innerText()), await row.innerText());
  await row.getByRole('button', { name: 'Verify', exact: true }).click();
  await page.waitForTimeout(2000);
}

// ── Back to the employer, who now has a live posting and a student ─────────

{
  const { page } = employer;
  await page.goto(`${BASE}/employer`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  check('verification puts the posting live without anyone reposting it',
    await page.getByText('Live').first().isVisible());
}

// ── The student applies to the posting that just went live ────────────────

{
  const { page } = student;
  await page.goto(`${BASE}/discover`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const fresh = page.locator('article.card', { hasText: 'Journey Barista' }).first();
  check('the new posting reaches the student feed', await fresh.isVisible());
  await fresh.getByRole('link', { name: 'View' }).click();
  await page.waitForURL('**/opportunity/**');
  await page.getByRole('link', { name: /I.m Interested/ }).click();
  await page.waitForURL('**/interest/**');
  await page.getByRole('button', { name: /Send My Interest/ }).click();
  await page.waitForTimeout(2000);
  check('an already signed-in student is not asked to sign in again',
    await page.getByText(/^Sent to /).isVisible());
}

// ── The employer sees a person, and only what §33 allows ──────────────────

{
  const { page } = employer;
  await page.goto(`${BASE}/employer`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const posting = page.locator('article.card', { hasText: 'Journey Barista' }).first();
  await posting.getByRole('link', { name: 'View students' }).click();
  await page.waitForURL('**/employer/opportunity/**');
  await page.waitForTimeout(1500);

  const applicant = page.locator('article.card').first();
  check('the employer sees the interested student', await applicant.isVisible());

  const shown = await page.locator('body').innerText();
  check('they see a first name', shown.includes('Priya'));
  /* §33. The envelope is enforced in SQL; this is the screen agreeing. */
  for (const secret of [STUDENT, '95050', '37.3496', '-121.9585']) {
    check(`the screen never shows ${secret}`, !shown.includes(secret));
  }

  await applicant.getByRole('button', { name: /I.d like to connect/ }).click();
  await page.waitForTimeout(2000);
}

// ── And the student hears back ─────────────────────────────────────────────

{
  const { page } = student;
  await page.goto(`${BASE}/activity`, { waitUntil: 'networkidle' });
  await page.getByText('They want to talk').waitFor();
  check('the student is told the employer wants to talk', true);

  /* Two applications, two different states, and the earlier one must not have
     been overwritten by the later one. */
  const shown = await page.locator('body').innerText();
  check('their first application is still there and still waiting',
    shown.includes('Interest sent'), shown.slice(0, 300));
  check('and the student is never shown a rejection they did not get',
    !shown.includes('Went another way'));

  /* §34. The loop used to stop at "check your email for the next step", with
     no next step in any email. This is the end of it: the student can now
     actually reach the organization that asked to speak to them. */
  /* Matched case-insensitively: the label is uppercased in CSS, so innerText
     returns it shouting. */
  check('the student is given a way to reach them', /how to reach them/i.test(shown));
  check('and is told who to ask for', /Ask for /.test(shown), shown.slice(0, 400));
  check('and is given something to say', shown.includes('Not sure what to say?'));
  check('and is told their own details did not travel',
    /do not have your phone number/.test(shown));
}

await student.context.close();
await employer.context.close();
await admin.context.close();
await browser.close();
console.log(failures === 0 ? '\nJOURNEY: the loop holds' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
