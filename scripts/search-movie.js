import { CdpSession } from './cdp-helper.js';

async function run() {
  const cdp = new CdpSession();
  await cdp.connect();
  const searchResults = await cdp.eval(`
    window.__test_search = async () => {
      const res = await fetch('/api/v1/search?q=Night+of+the+Living+Dead');
      return await res.json();
    };
    window.__test_search();
  `);
  console.log('Search Results:', JSON.stringify(searchResults, null, 2));
  cdp.close();
}

run().catch(console.error);
