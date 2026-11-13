import { CdpSession } from './cdp-helper.js';

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  const cdp = new CdpSession();
  await cdp.connect();
  console.log('Connected to Chrome via CDP!');

  // Step 1: Navigate to the movie detail page for Night of the Living Dead
  console.log('\n--- STEP 1: Navigating to Night of the Living Dead (ID 1166) ---');
  await cdp.navigate('http://127.0.0.1:5174/media/movie/1166');
  await sleep(3000);

  const title = await cdp.eval('document.title');
  console.log('Page Title:', title);

  const hasRequestBtn = await cdp.eval(`
    Boolean(Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Request Movie')))
  `);
  console.log('Has "Request Movie" button:', hasRequestBtn);

  await cdp.screenshot('01-movie-detail-ready-to-request.png');

  // Step 2: Click the "Request Movie" button
  console.log('\n--- STEP 2: Triggering Request ---');
  const clicked = await cdp.eval(`
    (() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Request Movie'));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    })()
  `);
  console.log('Clicked Request Movie button:', clicked);

  await sleep(2500);

  // Check toast notification and updated button state
  const toastText = await cdp.eval(`
    Array.from(document.querySelectorAll('[role="alert"], [class*="toast"], [class*="Toast"]'))
      .map(t => t.innerText)
      .join(' | ')
  `);
  console.log('Toast Notification:', toastText);

  await cdp.screenshot('02-requested-toast-feedback.png');

  // Step 3: Check Downloads page
  console.log('\n--- STEP 3: Checking Downloads Page ---');
  await cdp.navigate('http://127.0.0.1:5174/downloads');
  await sleep(3000);

  const downloadsTabContent = await cdp.eval(`
    document.querySelector('#download-queue')?.innerText || document.body.innerText.slice(0, 500)
  `);
  console.log('Downloads Page Summary:\n', downloadsTabContent.slice(0, 300));

  await cdp.screenshot('03-downloads-page.png');

  // Step 4: Navigate back to the movie page to watch reactive state transition
  console.log('\n--- STEP 4: Returning to Movie Detail Page ---');
  await cdp.navigate('http://127.0.0.1:5174/media/movie/1166');
  await sleep(3000);

  // Poll for button state changes
  console.log('Observing reactive CTA state on media detail page...');
  let playButtonFound = false;
  for (let i = 0; i < 60; i++) {
    const buttonTexts = await cdp.eval(`
      Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(Boolean)
    `);
    const isPlay = buttonTexts.some(b => b.toLowerCase().includes('play') || b.toLowerCase().includes('watch'));
    const isDownloading = buttonTexts.some(b => b.toLowerCase().includes('downloading') || b.toLowerCase().includes('searching'));

    if (isPlay) {
      console.log(`[T+${i * 3}s] Play button is LIVE! Buttons:`, buttonTexts);
      playButtonFound = true;
      break;
    } else {
      console.log(`[T+${i * 3}s] Current state (isDownloading=${isDownloading}):`, buttonTexts.filter(b => b.includes('Request') || b.includes('Download') || b.includes('Search') || b.includes('Play')));
    }
    await sleep(3000);
  }

  await cdp.screenshot('04-reactive-cta-transition.png');

  if (playButtonFound) {
    console.log('\n--- STEP 5: Clicking Play Button to Stream in In-App Player ---');
    await cdp.eval(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b =>
          b.innerText.toLowerCase().includes('play') || b.innerText.toLowerCase().includes('watch')
        );
        if (btn) btn.click();
      })()
    `);
    await sleep(4000);

    const isPlayerOpen = await cdp.eval(`
      Boolean(document.querySelector('video') || document.querySelector('[class*="player"]'))
    `);
    console.log('Player Modal Open & Video Element Present:', isPlayerOpen);

    await cdp.screenshot('05-unified-player-streaming.png');
  }

  cdp.close();
  console.log('\nLive test run finished!');
}

run().catch(console.error);
