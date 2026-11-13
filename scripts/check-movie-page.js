import { CdpSession } from './cdp-helper.js';

async function run() {
  const cdp = new CdpSession();
  await cdp.connect();
  console.log('Navigating to http://127.0.0.1:5174/media/movie/1166...');
  await cdp.navigate('http://127.0.0.1:5174/media/movie/1166');
  await new Promise(r => setTimeout(r, 2500));

  const title = await cdp.eval('document.title');
  console.log('Title:', title);

  const heroButtons = await cdp.eval(`
    Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(Boolean)
  `);
  console.log('Hero Buttons:', heroButtons);

  await cdp.screenshot('night-of-the-living-dead-detail.png');
  cdp.close();
}

run().catch(console.error);
