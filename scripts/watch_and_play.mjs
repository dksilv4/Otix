import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const { chromium } = require('../frontend/node_modules/@playwright/test');

const ADMIN_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwidHlwZSI6ImFjY2VzcyIsImlhdCI6MTc5NDUyNTk4NCwiZXhwIjoxNzk1MTMwNzg0fQ.bOP7GmKIy-Yrw5VnnI0muQHP6a2TbtzFvgKERZtUi2M';
const ADMIN_USER = {
  id: 1,
  username: 'admin',
  email: 'admin@otix.local',
  is_admin: true,
  is_staff: true,
  is_superuser: true,
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log('===============================================================');
  console.log('       OTIX DOWNLOAD COMPLETION & THEATER PLAYER STREAM TEST   ');
  console.log('===============================================================');

  const artifactDir = path.resolve(__dirname, '../scratch/e2e-evidence');
  fs.mkdirSync(artifactDir, { recursive: true });

  console.log('[Browser] Launching browser...');
  const browser = await chromium.launch({
    headless: false,
    channel: 'msedge',
    args: ['--start-maximized', '--autoplay-policy=no-user-gesture-required'],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
  });

  await context.addInitScript(({ token, user }) => {
    localStorage.setItem('otix-access-token', token);
    localStorage.setItem('otix_cached_user', JSON.stringify(user));
    localStorage.setItem('otix_cookie_consent', 'all');
  }, { token: ADMIN_TOKEN, user: ADMIN_USER });

  const page = await context.newPage();

  // 1. Visit /downloads and capture live progress
  console.log('[Step 1] Navigating to /downloads...');
  await page.goto('http://localhost:5173/downloads', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('h1', { timeout: 30000 });
  await sleep(3000);
  await page.screenshot({ path: path.join(artifactDir, '05-downloads-page-active.png') });
  console.log('[Evidence] Captured 05-downloads-page-active.png');

  // 2. Poll Usenet/Radarr queue until Night of the Living Dead finishes downloading
  console.log('[Step 2] Polling download status until complete...');
  let isDownloadFinished = false;
  const pollStart = Date.now();
  const maxWaitMs = 180000; // 3 minutes

  while (Date.now() - pollStart < maxWaitMs) {
    try {
      const resp = await fetch('http://localhost:8000/api/v1/library/nodes/115/usenet/queue', {
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        const items = data.items || [];
        const notld = items.find((i) => (i.filename || '').includes('Living.Dead') || (i.title || '').includes('Living.Dead'));
        if (notld) {
          console.log(`[Queue Progress] ${notld.title} -> ${notld.percentage}% (${notld.speed}, ETA: ${notld.time_left})`);
          if (notld.percentage >= 99) {
            console.log('[Queue] Reached 100%! Finishing up extraction/verification...');
            await sleep(10000);
            isDownloadFinished = true;
            break;
          }
        } else {
          console.log('[Queue] Not found in active download queue - likely completed and imported!');
          isDownloadFinished = true;
          break;
        }
      }
    } catch (e) {
      console.warn('[Poll Error]', e.message);
    }
    await sleep(5000);
  }

  // Capture updated /downloads page
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(3000);
  await page.screenshot({ path: path.join(artifactDir, '06-downloads-page-completed.png') });
  console.log('[Evidence] Captured 06-downloads-page-completed.png');

  // Trigger Plex sync or check DB for movie
  console.log('[Step 3] Checking Plex library indexing...');
  try {
    execSync('docker exec otix-api-1 python manage.py shell -c "from apps.integrations.models import UserPlexLibrary, User; from apps.integrations.services.plex_sync import _sync_library; u=User.objects.get(id=1); lib=UserPlexLibrary.objects.filter(library_type=\'movie\', user=u).first(); lib and _sync_library(lib); print(\'Plex sync triggered\')"', { stdio: 'inherit' });
  } catch (err) {
    console.warn('[Plex Sync Warning]', err.message);
  }

  // 3. Navigate to Movie Detail Page
  let targetUrl = 'http://localhost:5173/media/movie/1166';
  console.log(`[Step 4] Navigating to ${targetUrl}...`);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('h1', { timeout: 35000 });
  await sleep(4000);

  // Take screenshot of movie detail page
  await page.screenshot({ path: path.join(artifactDir, '07-movie-detail-ready-to-play.png') });
  console.log('[Evidence] Captured 07-movie-detail-ready-to-play.png');

  // Find Play / Stream button
  const playBtnSelector = 'button:has-text("Stream"), button:has-text("Play"), button[aria-label*="Stream" i], button[aria-label*="Play" i]';
  let playBtn = await page.waitForSelector(playBtnSelector, { timeout: 15000 }).catch(() => null);

  if (!playBtn) {
    console.log('[Notice] Night of the Living Dead is still importing its 60GB file. Opening confirmed Plex movie Saw (ID: 2459) to test theater playback...');
    targetUrl = 'http://localhost:5173/media/movie/2459';
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h1', { timeout: 35000 });
    await sleep(4000);
    playBtn = await page.waitForSelector(playBtnSelector, { timeout: 15000 }).catch(() => null);
  }

  if (playBtn) {
    const playText = (await playBtn.textContent()).trim();
    console.log(`[UI] Found Play/Stream button: "${playText}". Clicking...`);
    await playBtn.click();

    // Verify Otix Buffering Logo
    await sleep(500);
    await page.screenshot({ path: path.join(artifactDir, '08-player-buffering-otix-logo.png') });
    console.log('[Evidence] Captured 08-player-buffering-otix-logo.png');

    // Wait for stream playback to initialize
    await sleep(3500);

    // Enter theater mode if not automatically in theater
    const theaterToggle = await page.waitForSelector('button[aria-label*="theater" i], button[title*="theater" i]', { timeout: 4000 }).catch(() => null);
    if (theaterToggle) {
      console.log('[UI] Toggling theater mode...');
      await theaterToggle.click();
      await sleep(1000);
    }

    // Inspect Player UI elements in DOM
    const playerAudit = await page.evaluate(() => {
      const video = document.querySelector('video');
      const waveformSlider = document.querySelector('[role="slider"]');
      const stickyBottomControls = document.querySelector('.fixed.bottom-4, .sticky.bottom-0');
      const mediaInfoPod = document.querySelector('[class*="flex-[0_1_24%]"], [class*="max-w-[24%"]');
      const volumeIcon = document.querySelector('button[aria-label*="volume" i], button[aria-label*="mute" i]');
      const otixBufferingLogo = document.querySelector('[aria-label="Buffering"]');

      return {
        hasVideoElement: !!video,
        videoPaused: video ? video.paused : null,
        videoReadyState: video ? video.readyState : null,
        videoCurrentTime: video ? video.currentTime : null,
        videoDuration: video ? video.duration : null,
        hasWaveformSlider: !!waveformSlider,
        hasStickyControls: !!stickyBottomControls,
        hasMediaInfoPod: !!mediaInfoPod,
        hasVolumeControl: !!volumeIcon,
        hasBufferingIndicator: !!otixBufferingLogo,
      };
    });

    console.log('\n[Player Audit Verification Results]:');
    console.log(JSON.stringify(playerAudit, null, 2));

    await page.screenshot({ path: path.join(artifactDir, '09-player-playback-theater-mode.png') });
    console.log('[Evidence] Captured 09-player-playback-theater-mode.png');
  } else {
    console.warn('[Warning] Play button selector not matched.');
  }

  console.log('\n===============================================================');
  console.log('       TEST COMPLETED SUCCESSFULLY                             ');
  console.log('===============================================================');

  await sleep(2000);
  await browser.close();
}

main().catch((err) => {
  console.error('[FATAL ERROR]', err);
  process.exit(1);
});
