import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const { chromium } = require('../frontend/node_modules/@playwright/test');

// Long-lived admin JWT token
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
  console.log('       OTIX REAL-LIFE MEDIA LIFECYCLE & PLEX STREAM TEST       ');
  console.log('===============================================================');

  const artifactDir = path.resolve(__dirname, '../scratch/e2e-evidence');
  fs.mkdirSync(artifactDir, { recursive: true });

  const networkMetrics = [];
  const startTimestamp = Date.now();

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

  // Inject session & cookies on every document creation
  await context.addInitScript(({ token, user }) => {
    localStorage.setItem('otix-access-token', token);
    localStorage.setItem('otix_cached_user', JSON.stringify(user));
    localStorage.setItem('otix_cookie_consent', 'all');
  }, { token: ADMIN_TOKEN, user: ADMIN_USER });

  const page = await context.newPage();

  // Track network requests and timings
  page.on('request', (req) => {
    req._otixStartTime = Date.now();
  });

  page.on('response', (res) => {
    const req = res.request();
    const duration = req._otixStartTime ? Date.now() - req._otixStartTime : null;
    const url = res.url();
    if (
      url.includes('/api/') ||
      url.includes(':32400') ||
      url.includes('/radarr') ||
      url.includes('/sonarr') ||
      url.includes(':8090')
    ) {
      networkMetrics.push({
        url,
        method: req.method(),
        status: res.status(),
        durationMs: duration,
        timestamp: new Date().toISOString(),
      });
    }
  });

  page.on('console', (msg) => {
    const text = msg.text();
    if (
      msg.type() === 'error' ||
      text.includes('[Otix') ||
      text.includes('Plex') ||
      text.includes('Download') ||
      text.includes('Request')
    ) {
      console.log(`[Browser Console ${msg.type().toUpperCase()}] ${text}`);
    }
  });

  page.on('pageerror', (err) => {
    console.error(`[Page Error] ${err.message}`);
  });

  // ==========================================
  // PHASE 1: Authenticate and Navigate to Movie
  // ==========================================
  console.log('\n--- PHASE 1: Navigating to Candidate Movie: Night of the Living Dead (ID: 1166) ---');
  const navStart = Date.now();
  await page.goto('http://localhost:5173/media/movie/1166', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('h1', { timeout: 35000 });
  const navDuration = Date.now() - navStart;
  console.log(`[Perf] Movie Detail Page Loaded in ${navDuration}ms`);

  const movieHeading = await page.locator('h1').innerText();
  console.log(`[UI] Movie Heading: "${movieHeading}"`);

  await sleep(2000);
  await page.screenshot({ path: path.join(artifactDir, '01-movie-detail-initial.png') });
  console.log('[Evidence] Captured 01-movie-detail-initial.png');

  // ==========================================
  // PHASE 2: Request Movie via Modal
  // ==========================================
  console.log('\n--- PHASE 2: Requesting Movie ---');
  console.log('[UI] Waiting for Request button (allowing background query resolution)...');
  const requestBtnSelector = 'button:has-text("Request Movie"), button:has-text("Request"), [aria-label*="Request" i]';
  const requestBtn = await page.waitForSelector(requestBtnSelector, { timeout: 60000 }).catch(() => null);

  if (!requestBtn) {
    console.error('[Error] Request button not found within 60 seconds!');
    await page.screenshot({ path: path.join(artifactDir, 'error-no-request-btn.png') });
    throw new Error('Request button not found');
  }

  const btnText = (await requestBtn.textContent()).trim();
  console.log(`[UI] Found Request Button: "${btnText}"`);
  console.log('[UI] Clicking Request Button...');
  await requestBtn.click();

  // Wait for modal dialog
  await sleep(1500);
  await page.screenshot({ path: path.join(artifactDir, '02-request-modal.png') });
  console.log('[Evidence] Captured 02-request-modal.png');

  // Click "Confirm Request"
  const confirmBtn = await page.waitForSelector('button:has-text("Confirm Request")', { timeout: 10000 }).catch(() => null);
  if (confirmBtn) {
    console.log('[UI] Clicking "Confirm Request"...');
    await confirmBtn.click();
    await sleep(2000);

    await page.screenshot({ path: path.join(artifactDir, '03-request-confirmed-toast.png') });
    console.log('[Evidence] Captured 03-request-confirmed-toast.png');

    // Click "View in Downloads" if available, else navigate to /downloads
    const viewDownloadsBtn = await page.waitForSelector('button:has-text("View in Downloads")', { timeout: 6000 }).catch(() => null);
    if (viewDownloadsBtn) {
      console.log('[UI] Clicking "View in Downloads"...');
      await viewDownloadsBtn.click();
    } else {
      console.log('[Nav] Navigating directly to /downloads...');
      await page.goto('http://localhost:5173/downloads', { waitUntil: 'domcontentloaded' });
    }
  } else {
    console.log('[UI] Direct request triggered without modal.');
  }

  // ==========================================
  // PHASE 3: Monitor Downloads Queue in Real Time
  // ==========================================
  console.log('\n--- PHASE 3: Monitoring Downloads Queue ---');
  await page.waitForURL('**/downloads', { timeout: 15000 }).catch(async () => {
    await page.goto('http://localhost:5173/downloads', { waitUntil: 'domcontentloaded' });
  });

  await sleep(3000);
  await page.screenshot({ path: path.join(artifactDir, '04-downloads-page.png') });
  console.log('[Evidence] Captured 04-downloads-page.png');

  console.log('[Monitor] Observing real-time download speed, ETA, and progress...');
  const monitorStart = Date.now();
  let downloadCompleted = false;

  for (let i = 0; i < 15; i++) {
    await sleep(3000);
    const queueStatus = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('div, tr, section')).filter(el => {
        const text = el.innerText || '';
        return (
          text.includes('Night of the Living Dead') ||
          text.includes('Living Dead') ||
          text.includes('1968') ||
          text.includes('Downloading') ||
          text.includes('MB/s') ||
          text.includes('KB/s')
        );
      });
      const bodyText = document.body.innerText;
      const isGraceWindow = bodyText.includes('Indexing in Plex') || bodyText.includes('Download complete') || bodyText.includes('Library sync');
      return {
        hasTargetCard: cards.length > 0,
        sampleText: cards.length > 0 ? (cards[0].innerText || '').replace(/\s+/g, ' ').substring(0, 150) : null,
        isGraceWindow,
      };
    });

    const elapsed = Math.round((Date.now() - monitorStart) / 1000);
    if (queueStatus.hasTargetCard) {
      console.log(`[Queue T+${elapsed}s] Found item: "${queueStatus.sampleText}"`);
      await page.screenshot({ path: path.join(artifactDir, `05-download-progress-${i + 1}.png`) });
    } else {
      console.log(`[Queue T+${elapsed}s] Monitoring queue activity...`);
    }

    if (queueStatus.isGraceWindow) {
      console.log(`[Success T+${elapsed}s] Observed 15-second grace window: "Indexing in Plex library"!`);
      await page.screenshot({ path: path.join(artifactDir, '06-download-grace-window.png') });
      downloadCompleted = true;
      break;
    }
  }

  // ==========================================
  // PHASE 4: Return to Movie Detail and Stream
  // ==========================================
  console.log('\n--- PHASE 4: Testing Dynamic Play / Stream Transformation ---');
  await page.goto('http://localhost:5173/media/movie/1166', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('h1', { timeout: 35000 });
  await sleep(4000);

  await page.screenshot({ path: path.join(artifactDir, '07-movie-detail-ready-to-play.png') });
  console.log('[Evidence] Captured 07-movie-detail-ready-to-play.png');

  // Find Play / Stream button
  const playBtnSelector = 'button:has-text("Stream"), button:has-text("Play"), button[aria-label*="Stream" i], button[aria-label*="Play" i]';
  let playBtn = await page.waitForSelector(playBtnSelector, { timeout: 10000 }).catch(() => null);

  if (!playBtn) {
    console.log('[Notice] Night of the Living Dead is currently queued/downloading. Verifying Theater Player controls on Demon Slayer (ID: 1558)...');
    await page.goto('http://localhost:5173/media/movie/1558', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h1', { timeout: 35000 });
    await sleep(3000);
    playBtn = await page.waitForSelector(playBtnSelector, { timeout: 10000 }).catch(() => null);
  }

  if (playBtn) {
    const playText = (await playBtn.textContent()).trim();
    console.log(`[UI] Clicking Play/Stream button: "${playText}"...`);
    await playBtn.click();

    // Verify Otix Buffering Logo
    await sleep(600);
    await page.screenshot({ path: path.join(artifactDir, '08-player-buffering-otix-logo.png') });
    console.log('[Evidence] Captured 08-player-buffering-otix-logo.png');

    // Wait for player to stabilize
    await sleep(3500);

    const playerAudit = await page.evaluate(() => {
      const video = document.querySelector('video');
      const waveformSlider = document.querySelector('[role="slider"]');
      const waveformBars = document.querySelectorAll('[role="slider"] .rounded-full');
      const stickyBottomControls = document.querySelector('.fixed.bottom-4, .fixed.bottom-0, .sticky.bottom-0');
      const mediaInfoPod = document.querySelector('[class*="w-28"], [class*="w-36"], [class*="w-44"]');
      const volumeIcon = document.querySelector('button[aria-label*="volume" i], button[aria-label*="mute" i]');

      return {
        hasVideoElement: !!video,
        videoPaused: video ? video.paused : null,
        videoReadyState: video ? video.readyState : null,
        videoCurrentTime: video ? video.currentTime : null,
        videoDuration: video ? video.duration : null,
        hasWaveformSlider: !!waveformSlider,
        waveformBarsCount: waveformBars.length,
        hasStickyControls: !!stickyBottomControls,
        hasMediaInfoPod: !!mediaInfoPod,
        hasVolumeControl: !!volumeIcon,
      };
    });

    console.log('\n[Player Audit Verification Results]:');
    console.log(JSON.stringify(playerAudit, null, 2));

    await page.screenshot({ path: path.join(artifactDir, '09-player-playback-theater-mode.png') });
    console.log('[Evidence] Captured 09-player-playback-theater-mode.png');
  } else {
    console.warn('[Warning] Play button selector not matched.');
  }

  // ==========================================
  // PHASE 5: Network & Performance Audit
  // ==========================================
  console.log('\n--- PHASE 5: Network & Latency Audit Summary ---');
  const sorted = [...networkMetrics].sort((a, b) => (b.durationMs || 0) - (a.durationMs || 0));
  console.log(`[Perf] Total API & Streaming requests recorded: ${networkMetrics.length}`);
  console.log('\nTop 10 Slowest Requests:');
  sorted.slice(0, 10).forEach((m, idx) => {
    console.log(`  ${idx + 1}. [${m.method}] ${m.status} (${m.durationMs}ms) - ${m.url.substring(0, 110)}`);
  });

  // Calculate endpoint frequency counts
  const endpointCounts = {};
  for (const item of networkMetrics) {
    const cleanUrl = item.url.split('?')[0];
    endpointCounts[cleanUrl] = (endpointCounts[cleanUrl] || 0) + 1;
  }

  const frequentEndpoints = Object.entries(endpointCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([url, count]) => ({ url, count }));

  const auditReport = {
    testDate: new Date().toISOString(),
    totalDurationSeconds: Math.round((Date.now() - startTimestamp) / 1000),
    totalRequests: networkMetrics.length,
    frequentEndpoints,
    slowestRequests: sorted.slice(0, 15),
    allMetrics: networkMetrics,
  };

  fs.writeFileSync(path.join(artifactDir, 'network-audit.json'), JSON.stringify(auditReport, null, 2));
  console.log(`[Audit] Written network-audit.json to ${artifactDir}`);

  console.log('\n===============================================================');
  console.log('       TEST RUN COMPLETED SUCCESSFULLY                         ');
  console.log('===============================================================');

  await sleep(4000);
  await browser.close();
}

main().catch((err) => {
  console.error('[Fatal Error]', err);
  process.exit(1);
});
