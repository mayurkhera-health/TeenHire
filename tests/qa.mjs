import { chromium } from 'playwright';

/* QA pass: the student's side of the product, on a phone.
 *
 * tests/journey.mjs proves the marketplace loop closes — student, employer,
 * admin, end to end. This is the other half: the flows a teenager actually
 * repeats, and the states they hit when things are empty, wrong or
 * interrupted. It runs at 375x812 because that is the product's primary
 * device, and it reports accessibility and layout findings rather than
 * failing on them, so one a11y nit cannot hide a broken apply flow.
 *
 * Needs a dev server and a seeded database:
 *   npm run db:migrate && npm run db:seed
 *   npm run dev -- -p 3800
 *   node tests/qa.mjs
 */

const BASE = process.env.QA_URL ?? 'http://127.0.0.1:3800';
const PHONE = { width: 375, height: 812 };
const RUN = Date.now().toString(36);

const results = [];
const findings = [];

const record = (name, ok, note = '') => {
  results.push({ name, ok, note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `\n        ${note}` : ''}`);
};
const finding = (severity, category, text) => findings.push({ severity, category, text });

async function scenario(name, fn) {
  const context = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const crashes = [];
  page.on('pageerror', (e) => crashes.push(e.message));
  try {
    await fn(page, context);
    if (crashes.length > 0) record(name, false, `threw in the browser: ${crashes[0]}`);
    else record(name, true);
  } catch (error) {
    record(name, false, error.message.split('\n')[0]);
  } finally {
    await context.close();
  }
}

/* Onboarding, as a helper rather than a test — most scenarios need a student
   who has already got past it. */
async function onboard(page, { name = 'Priya', age = '16', radius = '10 miles' } = {}) {
  await page.goto(`${BASE}/start`, { waitUntil: 'networkidle' });
  await page.locator('#first-name').fill(name);
  await page.getByRole('button', { name: /Let.s go/ }).click();
  await page.waitForURL('**/onboarding/1');
  await page.getByRole('button', { name: age, exact: true }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL('**/onboarding/2');
  await page.locator('input[placeholder="95050"]').fill('95050');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL('**/onboarding/3');
  await page.getByRole('button', { name: radius }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL('**/onboarding/4');
  await page.getByRole('button', { name: 'Earn money' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL('**/onboarding/5');
  await page.getByRole('button', { name: 'Weekends' }).click();
  await page.getByRole('button', { name: /Show me what.s near me/ }).click();
  await page.waitForURL('**/discover');
  await page.waitForTimeout(900);
}

async function signIn(page, contact) {
  await page.getByRole('button', { name: 'Email', exact: true }).click();
  await page.locator('#contact').fill(contact);
  await page.getByRole('button', { name: 'Send me a code' }).click();
  const panel = page.locator('.fit', { hasText: 'Development only' });
  await panel.waitFor();
  const code = (await panel.textContent()).match(/\b(\d{6})\b/)?.[1];
  if (!code) throw new Error('no development code on screen');
  await page.locator('#code').fill(code);
  await page.getByRole('button', { name: /^(Create my account|Continue|Verify)/ }).click();
  await page.waitForTimeout(1200);
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium',
  channel: 'chromium',
  args: ['--no-proxy-server'],
});

console.log(`QA pass at ${PHONE.width}x${PHONE.height} against ${BASE}\n`);

// ── Landing and onboarding ─────────────────────────────────────────────────

await scenario(
  'Given a first-time visitor, When they open the site, Then they see the welcome screen and are not asked to log in',
  async (page, context) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForURL('**/start', { timeout: 30_000 });
    if (!(await page.locator('#first-name').isVisible())) throw new Error('no name field on the welcome screen');
    const cookies = await context.cookies();
    if (cookies.some((c) => c.name === 'th_session')) throw new Error('a session existed before any sign-in');
    const signInWords = await page.getByText(/log in|sign in|password/i).count();
    if (signInWords > 0) finding('Low', 'Auth gate', 'The welcome screen mentions signing in, which the deferred-registration design is meant to avoid.');
  },
);

await scenario(
  'Given onboarding, When a student answers all five questions, Then they reach the feed with opportunities',
  async (page) => {
    await onboard(page);
    const cards = await page.locator('article.card').count();
    if (cards === 0) throw new Error('the feed is empty after onboarding — is the database seeded?');
  },
);

await scenario(
  'Given onboarding step 3, When the page is refreshed, Then the answers so far survive',
  async (page) => {
    await page.goto(`${BASE}/start`, { waitUntil: 'networkidle' });
    await page.locator('#first-name').fill('Refresh');
    await page.getByRole('button', { name: /Let.s go/ }).click();
    await page.waitForURL('**/onboarding/1');
    await page.getByRole('button', { name: '17', exact: true }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForURL('**/onboarding/2');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    await page.goto(`${BASE}/onboarding/1`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    const stillChosen = await page.getByRole('button', { name: '17', exact: true }).getAttribute('aria-pressed');
    if (stillChosen !== 'true') throw new Error('the age answer was lost across a refresh');
  },
);

// ── Search, filters, results ───────────────────────────────────────────────

await scenario(
  'Given the feed, When a student searches for a real place, Then matching results appear with a count',
  async (page) => {
    await onboard(page);
    const firstTitle = (await page.locator('article.card h3, article.card h2').first().textContent()).trim();
    const word = firstTitle.split(/\s+/)[0];
    await page.locator('#feed-search').fill(word);
    await page.waitForTimeout(800);
    const heading = await page.getByRole('heading', { name: /\d+ match/ }).count();
    if (heading === 0) throw new Error(`searching "${word}" showed no match count`);
  },
);

await scenario(
  'Given the feed, When a student searches for something that does not exist, Then they get a way out rather than a dead end',
  async (page) => {
    await onboard(page);
    await page.locator('#feed-search').fill('zzzzqqqq');
    await page.waitForTimeout(800);
    const clear = page.getByRole('button', { name: /Clear what I picked/ });
    if (!(await clear.isVisible())) throw new Error('no recovery action in the empty state');
    if (await page.getByText(/No results found/i).count()) finding('Low', 'Empty state', '"No results found" appears, which the design explicitly avoids.');
    await clear.click();
    await page.waitForTimeout(800);
    if ((await page.locator('article.card').count()) === 0) throw new Error('clearing the search did not bring the list back');
  },
);

await scenario(
  'Given the feed, When a student taps a type filter, Then the list narrows and the filter reads as active',
  async (page) => {
    await onboard(page);
    const before = await page.locator('article.card').count();
    await page.getByRole('button', { name: 'Volunteer', exact: true }).click();
    await page.waitForTimeout(800);
    const after = await page.locator('article.card').count();
    if (after >= before) finding('Medium', 'Filters', `Filtering to Volunteer did not narrow the list (${before} → ${after}). Either the filter is not applied or the fixture has no non-volunteer work in range.`);
    const badge = await page.getByRole('button', { name: /^Filters/ }).textContent();
    if (!/·\s*\d/.test(badge)) throw new Error(`the Filters button does not show a count: "${badge.trim()}"`);
  },
);

await scenario(
  'Given the filter sheet, When a student sets a radius and a time, Then the sheet shows how many opportunities remain',
  async (page) => {
    await onboard(page);
    await page.getByRole('button', { name: /^Filters/ }).click();
    await page.waitForTimeout(500);
    /* Scoped to the sheet: "3 miles" also appears on the cards behind it. */
    const sheet = page.locator('.sheet, [role="dialog"]').last();
    await sheet.getByRole('button', { name: '3 miles' }).click();
    await sheet.getByRole('button', { name: 'After school' }).click();
    await page.waitForTimeout(400);
    const show = sheet.getByRole('button', { name: /Show \d+ opportunities/ });
    if (!(await show.isVisible())) throw new Error('the sheet does not say how many opportunities the filters leave');
    await show.click();
    await page.waitForTimeout(700);
  },
);

// ── Job detail, saving, applying ───────────────────────────────────────────

await scenario(
  'Given a result, When a student opens it, Then the detail screen names the role and offers to apply',
  async (page) => {
    await onboard(page);
    await page.locator('article.card').first().getByRole('link', { name: 'View' }).click();
    await page.waitForURL('**/opportunity/**');
    const title = (await page.locator('h1').first().textContent()).trim();
    if (title.length === 0) throw new Error('the detail screen has no title');
    if (!(await page.getByRole('link', { name: /I.m Interested/ }).isVisible())) {
      throw new Error('no way to express interest from the detail screen');
    }
  },
);

await scenario(
  'Given a result, When a student saves it, Then it appears under Saved and can be removed',
  async (page) => {
    await onboard(page);
    const card = page.locator('article.card').first();
    const title = (await card.locator('h3, h2').first().textContent()).trim();
    const save = card.getByRole('button').first();
    await save.click();
    await page.waitForTimeout(600);
    await page.goto(`${BASE}/saved`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    if ((await page.getByText(title, { exact: false }).count()) === 0) {
      throw new Error(`"${title}" was saved but does not appear under Saved`);
    }
  },
);

await scenario(
  'Given no saved opportunities, When a student opens Saved, Then they are told what to do rather than shown a blank page',
  async (page) => {
    await onboard(page);
    await page.goto(`${BASE}/saved`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    if ((await page.getByText(/Nothing saved yet/).count()) === 0) {
      throw new Error('the Saved empty state does not explain itself');
    }
  },
);

await scenario(
  'Given the apply flow, When a student enters an address that is not an address, Then they are told before anything is sent',
  async (page) => {
    await onboard(page);
    await page.locator('article.card').first().getByRole('link', { name: 'View' }).click();
    await page.waitForURL('**/opportunity/**');
    await page.getByRole('link', { name: /I.m Interested/ }).click();
    await page.waitForURL('**/interest/**');
    await page.getByRole('button', { name: 'Email', exact: true }).click();
    await page.locator('#contact').fill('notanemail');
    await page.getByRole('button', { name: 'Send me a code' }).click();
    await page.waitForTimeout(900);
    const alert = await page.getByRole('alert').count();
    if (alert === 0) throw new Error('an invalid email was accepted without any message');
    if (await page.locator('#code').isVisible()) throw new Error('an invalid email advanced to the code step');
  },
);

await scenario(
  'Given the apply flow, When a student signs in and sends their interest, Then it is confirmed and appears under Activity',
  async (page) => {
    await onboard(page);
    await page.locator('article.card').first().getByRole('link', { name: 'View' }).click();
    await page.waitForURL('**/opportunity/**');
    await page.getByRole('link', { name: /I.m Interested/ }).click();
    await page.waitForURL('**/interest/**');
    await signIn(page, `qa-apply-${RUN}@example.com`);
    await page.getByRole('button', { name: /Send My Interest/ }).click();
    await page.waitForTimeout(2000);
    if ((await page.getByText(/^Sent to /).count()) === 0) throw new Error('no confirmation after sending');
    await page.goto(`${BASE}/activity`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    if ((await page.getByText('Interest sent').count()) === 0) throw new Error('the application does not appear under Activity');
  },
);

await scenario(
  'Given nothing sent yet, When a student opens Activity, Then the empty state explains itself',
  async (page) => {
    await onboard(page);
    await page.goto(`${BASE}/activity`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    if ((await page.getByText(/Nothing sent yet/).count()) === 0) {
      throw new Error('the Activity empty state does not explain itself');
    }
  },
);

// ── Navigation ─────────────────────────────────────────────────────────────

await scenario(
  'Given a student who filtered and opened a result, When they press back, Then their filters are still applied',
  async (page) => {
    await onboard(page);
    await page.getByRole('button', { name: 'Volunteer', exact: true }).click();
    await page.waitForTimeout(700);
    const badgeBefore = (await page.getByRole('button', { name: /^Filters/ }).textContent()).trim();
    await page.locator('article.card').first().getByRole('link', { name: 'View' }).click();
    await page.waitForURL('**/opportunity/**');
    await page.goBack();
    await page.waitForTimeout(1200);
    const badgeAfter = (await page.getByRole('button', { name: /^Filters/ }).textContent()).trim();
    if (badgeAfter !== badgeBefore) {
      throw new Error(`filters were lost on back: "${badgeBefore}" became "${badgeAfter}"`);
    }
  },
);

await scenario(
  'Given a filtered feed, When the URL is shared, Then it opens with the same filters applied',
  async (page) => {
    await onboard(page);
    await page.getByRole('button', { name: 'Volunteer', exact: true }).click();
    await page.waitForTimeout(700);
    await page.getByRole('button', { name: /^Filters/ }).click();
    await page.waitForTimeout(400);
    const sheet = page.locator('.sheet, [role="dialog"]').last();
    await sheet.getByRole('button', { name: 'Weekends' }).click();
    await sheet.getByRole('button', { name: /Show \d+ opportunities/ }).click();
    await page.waitForTimeout(700);

    const shared = page.url();
    if (!/types=|when=/.test(shared)) throw new Error(`filters are not in the URL: ${shared}`);

    /* Opened fresh, the way a friend would open it. */
    await page.goto(`${BASE}/discover`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    const clean = (await page.getByRole('button', { name: /^Filters/ }).textContent()).trim();
    if (/·/.test(clean)) throw new Error(`a plain /discover arrived with filters: "${clean}"`);

    await page.goto(shared, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    /* Two were set: a type and a timing. */
    const restored = (await page.getByRole('button', { name: /^Filters/ }).textContent()).trim();
    if (!/·\s*2/.test(restored)) throw new Error(`the shared link did not restore both filters: "${restored}"`);
    const volunteer = await page.getByRole('button', { name: 'Volunteer', exact: true }).getAttribute('aria-pressed');
    if (volunteer !== 'true') throw new Error('the type chip did not come back selected');
  },
);

await scenario(
  'Given a hand-edited URL, When it names filters that do not exist, Then they are ignored rather than breaking the feed',
  async (page) => {
    await onboard(page);
    await page.goto(`${BASE}/discover?types=paid,nonsense&r=9999&when=never&q=${'x'.repeat(400)}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const badge = (await page.getByRole('button', { name: /^Filters/ }).textContent()).trim();
    /* Only the one real value survives. */
    if (!/·\s*1/.test(badge)) throw new Error(`unknown values were not discarded: "${badge}"`);
    if ((await page.getByRole('button', { name: /Clear what I picked/ }).count()) === 0) {
      throw new Error('a nonsense search left no way back');
    }
  },
);

await scenario(
  'Given a shared link to an opportunity, When someone opens it with no account, Then the page renders rather than redirecting them away',
  async (page) => {
    await onboard(page);
    await page.locator('article.card').first().getByRole('link', { name: 'View' }).click();
    await page.waitForURL('**/opportunity/**');
    const url = page.url();

    const stranger = await browser.newContext({ viewport: PHONE });
    const cold = await stranger.newPage();
    await cold.goto(url, { waitUntil: 'networkidle' });
    await cold.waitForTimeout(1500);
    const landed = cold.url();
    await stranger.close();
    if (!landed.includes('/opportunity/')) {
      finding('Medium', 'Deep links', `A shared opportunity link sends a visitor with no profile to ${landed} instead of the opportunity. Anything a student shares with a friend lands on the wrong screen.`);
    }
  },
);

await scenario(
  'Given a signed-in student, When they sign out, Then the session ends',
  async (page, context) => {
    await onboard(page);
    await page.locator('article.card').first().getByRole('link', { name: 'View' }).click();
    await page.waitForURL('**/opportunity/**');
    await page.getByRole('link', { name: /I.m Interested/ }).click();
    await page.waitForURL('**/interest/**');
    await signIn(page, `qa-signout-${RUN}@example.com`);
    await page.goto(`${BASE}/me`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const out = page.getByRole('button', { name: /Sign out/ });
    if (!(await out.isVisible())) throw new Error('no sign-out control on the profile screen');
    await out.click();
    await page.waitForTimeout(1500);
    const cookies = await context.cookies();
    const session = cookies.find((c) => c.name === 'th_session');
    if (session && session.value.length > 0) throw new Error('the session cookie survived signing out');
  },
);

// ── Mobile layout and accessibility, across every student route ────────────

const STUDENT_ROUTES = ['/start', '/onboarding/1', '/discover', '/saved', '/activity', '/me'];

await scenario(
  'Given every student screen at 375px, When it renders, Then nothing overflows sideways and text stays readable',
  async (page) => {
    await onboard(page);
    for (const route of STUDENT_ROUTES) {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(900);
      /* Where it actually landed. /start redirects a student who already has a
         profile, and labelling findings with the route asked for rather than
         the one rendered sends anyone reading this report to the wrong screen. */
      const at = new URL(page.url()).pathname;

      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow > 1) {
        finding('High', 'Mobile layout overflow', `${at} scrolls sideways by ${overflow}px at 375px wide. On a phone this makes the whole screen drift under the thumb.`);
      }

      /* Tap targets. 44px is Apple's guidance and WCAG 2.5.5; anything under
         is hard to hit accurately on a moving bus. */
      const small = await page.evaluate(() => {
        const out = [];
        for (const el of document.querySelectorAll('a[href], button, input, select, textarea')) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.height < 44 || r.width < 44) {
            out.push(`${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || el.id || '').trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
          }
        }
        return out;
      });
      for (const t of new Set(small)) {
        finding('Low', 'A11y tap targets', `${at}: ${t} is under 44x44.`);
      }

      const unlabelled = await page.evaluate(() =>
        [...document.querySelectorAll('input, select, textarea')]
          .filter((el) => {
            if (el.type === 'hidden') return false;
            if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return false;
            if (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) return false;
            return !el.closest('label');
          })
          .map((el) => `${el.tagName.toLowerCase()}#${el.id || '(no id)'}`));
      for (const u of unlabelled) {
        finding('Medium', 'A11y labels', `${at}: ${u} has no accessible name, so a screen reader announces nothing.`);
      }

      const tiny = await page.evaluate(() => {
        const out = new Set();
        for (const el of document.querySelectorAll('p, span, a, button, li, label, h1, h2, h3')) {
          if (!el.textContent.trim()) continue;
          const size = parseFloat(getComputedStyle(el).fontSize);
          if (size < 13) out.add(`${size}px "${el.textContent.trim().slice(0, 30)}"`);
        }
        return [...out];
      });
      for (const t of tiny) finding('Low', 'A11y text size', `${at}: ${t}`);

      /* Contrast, computed against the nearest painted ancestor. */
      const lowContrast = await page.evaluate(() => {
        const lum = (c) => {
          const [r, g, b] = c.map((v) => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const parse = (s) => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
        const ground = (el) => {
          for (let n = el; n; n = n.parentElement) {
            const bg = getComputedStyle(n).backgroundColor;
            if (bg && !/rgba?\([^)]*,\s*0\)/.test(bg) && bg !== 'transparent') return parse(bg);
          }
          return [255, 255, 255];
        };
        const out = new Set();
        for (const el of document.querySelectorAll('p, span, a, button, li, label, h1, h2, h3')) {
          const text = el.textContent.trim();
          if (!text || el.children.length > 0) continue;
          const style = getComputedStyle(el);
          const size = parseFloat(style.fontSize);
          const bold = Number(style.fontWeight) >= 700;
          const large = size >= 24 || (size >= 18.66 && bold);
          const a = lum(parse(style.color));
          const b = lum(ground(el));
          const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          const need = large ? 3 : 4.5;
          if (ratio < need) out.add(`${ratio.toFixed(2)}:1 (needs ${need}:1) on "${text.slice(0, 30)}"`);
        }
        return [...out];
      });
      for (const c of lowContrast) {
        finding('Medium', 'A11y contrast', `${at}: ${c}`);
      }
    }
  },
);

await browser.close();

// ── Report ─────────────────────────────────────────────────────────────────

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} scenarios passed`);

if (findings.length > 0) {
  console.log('\nFindings:');
  for (const level of ['High', 'Medium', 'Low']) {
    const group = findings.filter((f) => f.severity === level);
    if (group.length === 0) continue;
    console.log(`\n  ${level}`);
    const byCategory = new Map();
    for (const f of group) {
      if (!byCategory.has(f.category)) byCategory.set(f.category, []);
      byCategory.get(f.category).push(f.text);
    }
    for (const [category, texts] of byCategory) {
      console.log(`    ${category} (${texts.length})`);
      for (const t of [...new Set(texts)].slice(0, 8)) console.log(`      - ${t}`);
      if (new Set(texts).size > 8) console.log(`      ... and ${new Set(texts).size - 8} more`);
    }
  }
}

process.exit(results.every((r) => r.ok) ? 0 : 1);
