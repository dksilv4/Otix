import { CdpSession } from './cdp-helper.js';

async function run() {
  const cdp = new CdpSession();
  await cdp.connect();
  console.log('Connected to CDP!');

  console.log('Navigating to movie detail page for Night of the Living Dead (tmdbId=10331)...');
  await cdp.navigate('http://127.0.0.1:5174/media/movie/10331');

  await new Promise((r) => setTimeout(r, 3000));

  const pageTitle = await cdp.eval('document.title');
  console.log('Page Title:', pageTitle);

  const heroButtons = await cdp.eval(`
    Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(Boolean)
  `);
  console.log('Buttons on page:', heroButtons);

  await cdp.screenshot('step1-detail-page.png');

  cdp.close();
}

run().catch(console.error);
