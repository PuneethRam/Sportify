// SPO-6: coach first-week flow through the web app, headless Chrome.
// Local stack: next dev (port 3210) + Firebase Auth emulator + MySQL sportify_e2e.
const { chromium } = require('playwright-core');
const fs = require('fs');
const BASE = 'http://localhost:3210';
const OUT = process.env.SHOTS_DIR ?? '/tmp/sportify-e2e/shots';
fs.mkdirSync(OUT, { recursive: true });
const problems = [];

let browser;
async function as(name, fn, viewport = { width: 1280, height: 860 }) {
  const state = `/tmp/sportify-e2e/state-${name}.json`;
  const ctx = await browser.newContext({ viewport, storageState: fs.existsSync(state) ? state : undefined });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  const page = await ctx.newPage();
  page.on('pageerror', e => problems.push(`[${name}] pageerror ${e.message}`));
  page.on('response', r => {
    if (r.url().includes('/api/') && r.status() >= 400 && !r.url().includes('/api/placeholder')) problems.push(`[${name}] HTTP ${r.status()} ${r.request().method()} ${r.url()}`);
  });
  try { await fn(page); } finally { await ctx.storageState({ path: state, indexedDB: true }); await ctx.close(); }
}
const settle = async (page, ms = 2500) => { await page.waitForLoadState('networkidle'); await page.waitForTimeout(ms); };
const go = async (page, path) => { await page.goto(BASE + path); await settle(page); };
const waitFor = async (page, pred) => { for (let i = 0; i < 60 && !pred(page.url()); i++) await page.waitForTimeout(500); await settle(page); };
let n = 0;
const shot = async (page, label) => {
  const file = `${String(++n).padStart(2, '0')}-${label}.png`;
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${file}`, fullPage: true });
  console.log('shot', file, page.url().replace(BASE, ''));
};

async function signUp(page, name, email) {
  await page.fill('input[type=text]', name);
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', 'pilot-pass-1');
}

(async () => {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  let invite;

  await as('coach', async page => {
    await go(page, '/auth/signup');
    await signUp(page, 'Coach Priya', 'priya@academy.test');
    await shot(page, 'coach-signs-up');
    await page.click('text=Create Account');
    await waitFor(page, u => !u.includes('/auth/'));

    await go(page, '/academy'); // direct load: checks sign-in is restored before the page loads
    await page.click('button:has-text("Create Academy")');
    await page.fill('input[placeholder="e.g. Smash Badminton Academy"]', 'Velachery Shuttlers');
    await shot(page, 'coach-creates-academy');
    await page.locator('button:has-text("Create Academy")').last().click();
    await settle(page);
    await page.click('h3:has-text("Velachery Shuttlers")');
    await waitFor(page, u => u.includes('/org/'));
    await page.click('button:has-text("New Batch")');
    await page.fill('input[placeholder="e.g. Morning Batch, Advanced Group"]', 'Saturday 7am Juniors');
    await shot(page, 'coach-creates-batch');
    await page.locator('button:has-text("Create Batch")').last().click();
    await settle(page);
    const resp = page.waitForResponse(r => r.url().endsWith('/api/invites') && r.request().method() === 'POST');
    await page.click('button:has-text("Share invite")');
    invite = new URL((await (await resp).json()).url).pathname;
    await shot(page, 'batch-created-invite-link-copied');
  });

  const students = [['Arun Kumar', 'arun'], ['Divya R', 'divya'], ['Karthik S', 'karthik'], ['Meena V', 'meena']];
  for (const [i, [name, id]] of students.entries()) {
    await as(id, async page => {
      await go(page, invite);
      if (i === 0) await shot(page, 'student-opens-invite-link');
      await page.click('text=Create an account to join');
      await waitFor(page, u => u.includes('/auth/signup'));
      await signUp(page, name, `${id}@student.test`);
      if (i === 0) await shot(page, 'student-signs-up');
      await page.click('text=Create Account');
      await waitFor(page, u => u.includes('/i/'));
      if (i === 0) await shot(page, 'student-back-on-invite');
      await page.click('button:has-text("Join")');
      await waitFor(page, u => !u.includes('/i/'));
      if (i === 0) await shot(page, 'student-joined-batch');
    });
  }

  let batchPath;
  await as('coach', async page => {
    await go(page, '/org/1');
    await page.click('text=Manage');
    await waitFor(page, u => u.includes('/clan/'));
    batchPath = new URL(page.url()).pathname + new URL(page.url()).search;
    await shot(page, 'coach-batch-page');
    await page.click('text=Record results');
    await waitFor(page, u => u.includes('/bulk'));
    const rows = [
      { type: 'Singles', players: ['Arun Kumar', 'Divya R'], games: [[21, 15], [21, 18]] },
      { type: 'Singles', players: ['Karthik S', 'Meena V'], games: [[18, 21], [21, 19], [21, 12]] },
      { type: 'Doubles', players: ['Arun Kumar', 'Meena V', 'Divya R', 'Karthik S'], games: [[21, 17], [21, 16]] },
      { type: 'Singles', players: ['Coach Priya', 'Arun Kumar'], games: [[21, 9]] }, // coach plays: stays pending
    ];
    let sel = 0;
    for (const [i, r] of rows.entries()) {
      if (i > 0) await page.click('button:has-text("Add match")');
      await page.locator(`button:has-text("${r.type}")`).nth(i).click();
      for (const p of r.players) await page.locator('select').nth(sel++).selectOption({ label: p });
      for (const [gi, [a, b]] of r.games.entries()) {
        await page.getByLabel(`Game ${gi + 1} side 1`).nth(i).fill(String(a));
        await page.getByLabel(`Game ${gi + 1} side 2`).nth(i).fill(String(b));
      }
    }
    await shot(page, 'coach-enters-class-results');
    await page.locator('button', { hasText: /^Save all/ }).click();
    await settle(page, 3000);
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'results-saved-rating-changes-one-pending');
    await page.click('text=View matches');
    await waitFor(page, u => u.includes('/clan/matches?'));
    await shot(page, 'coach-match-list-awaiting-confirmation');
  });

  await as('arun', async page => {
    await go(page, '/clan/matches?clanId=1');
    await page.click('button:has-text("Confirm")');
    await settle(page);
    await shot(page, 'student-confirms-coach-result');
    await go(page, '/dashboard');
    await shot(page, 'student-dashboard-rating-streak-season');
    await go(page, '/clan/clandetails?clanId=1');
    await page.click('button:has-text("Season")');
    await settle(page);
    await shot(page, 'batch-season-standings');
    await go(page, '/settings/notifications');
    await page.getByLabel('Streak reminders').click({ force: true });
    await settle(page, 1000);
    await shot(page, 'notification-settings-streaks-off');
  });

  await as('ops', async page => {
    await go(page, '/auth/login');
    await page.fill('input[type=email]', 'ops@sportify.test');
    await page.fill('input[type=password]', 'pilot-pass-1');
    await page.locator('button', { hasText: /^\s*Sign In\s*$/ }).first().click();
    await waitFor(page, u => !u.includes('/auth/'));
    await go(page, '/admin/metrics');
    await shot(page, 'wac-counts-the-batch');
  });

  await browser.close();
  console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'no API errors or page errors');
})().catch(async e => { console.error(e); console.log(problems.join('\n')); await browser?.close(); process.exit(1); });
