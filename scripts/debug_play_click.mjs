import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('../frontend/node_modules/@playwright/test');

const ADMIN_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwidHlwZSI6ImFjY2VzcyIsImlhdCI6MTc5NDUyNTk4NCwiZXhwIjoxNzk1MTMwNzg0fQ.bOP7GmKIy-Yrw5VnnI0muQHP6a2TbtzFvgKERZtUi2M';

async function test() {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const context = await browser.newContext();
  await context.addInitScript(({ token }) => {
    localStorage.setItem('otix-access-token', token);
    localStorage.setItem('otix_cached_user', JSON.stringify({ id: 1, username: 'admin' }));
    localStorage.setItem('otix_cookie_consent', 'all');
  }, { token: ADMIN_TOKEN });

  const page = await context.newPage();
  page.on('console', (msg) => console.log(`[PAGE ${msg.type()}]`, msg.text()));
  page.on('pageerror', (err) => console.log('[PAGE ERROR]', err.message));

  console.log('Navigating to Saw (2459)...');
  await page.goto('http://localhost:5173/media/movie/2459');
  await page.waitForTimeout(6000);

  const btn = await page.waitForSelector('button:has-text("Stream"), button:has-text("Play")');
  console.log('Found button:', (await btn.textContent()).trim());

  console.log('Clicking button...');
  await btn.click();
  await page.waitForTimeout(4000);

  const state = await page.evaluate(() => {
    const video = document.querySelector('video');
    const dialogs = document.querySelectorAll('[role="dialog"]');
    const toasts = Array.from(document.querySelectorAll('[role="status"], [class*="toast"]')).map(t => t.textContent.trim());
    return {
      hasVideo: !!video,
      videoSrc: video ? video.src : null,
      dialogsCount: dialogs.length,
      toasts,
    };
  });

  console.log('Post-click evaluation:', JSON.stringify(state, null, 2));
  await browser.close();
}

test().catch(console.error);
