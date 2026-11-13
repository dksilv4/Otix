import { CdpSession } from './cdp-helper.js';

async function run() {
  const cdp = new CdpSession();
  await cdp.connect();
  await cdp.send('Console.enable');
  await cdp.send('Log.enable');

  const logs = [];
  cdp.ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Console.messageAdded' || msg.method === 'Log.entryAdded') {
      logs.push(msg.params);
    }
  };

  // Check what happens when Request Movie is clicked
  const res = await cdp.eval(`
    (() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Request Movie'));
      if (!btn) return 'Button not found';
      btn.click();
      return 'Clicked button';
    })()
  `);
  console.log('Eval res:', res);

  await new Promise(r => setTimeout(r, 3000));
  console.log('Logs captured:', logs);
  cdp.close();
}

run().catch(console.error);
