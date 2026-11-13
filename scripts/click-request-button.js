import { CdpSession } from './cdp-helper.js';

async function run() {
  const cdp = new CdpSession();
  await cdp.connect();
  console.log('Connected to CDP');

  // Find the "Request Movie" button and click it
  const clickResult = await cdp.eval(`
    (() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const reqBtn = buttons.find(b => b.innerText.trim().includes('Request Movie'));
      if (reqBtn) {
        reqBtn.click();
        return { clicked: true, text: reqBtn.innerText };
      }
      return { clicked: false, buttons: buttons.map(b => b.innerText) };
    })()
  `);
  console.log('Click result:', clickResult);

  // Wait 2 seconds for modal or toast or state change
  await new Promise(r => setTimeout(r, 2000));

  // Check if a modal (e.g. quality selection or confirmation) appeared, or toast appeared
  const modalOrToast = await cdp.eval(`
    (() => {
      const modals = Array.from(document.querySelectorAll('[role="dialog"], [role="alert"], [class*="toast"], [class*="modal"]')).map(el => el.innerText.trim());
      const buttons = Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim());
      return { modals, buttons };
    })()
  `);
  console.log('After click state:', modalOrToast);

  await cdp.screenshot('step2-after-request-click.png');
  cdp.close();
}

run().catch(console.error);
