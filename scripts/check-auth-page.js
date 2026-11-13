import { CdpSession } from './cdp-helper.js';

async function run() {
  const cdp = new CdpSession();
  await cdp.connect();
  console.log('Connected to Chrome!');

  await new Promise(r => setTimeout(r, 2000));
  const url = await cdp.eval('window.location.href');
  const title = await cdp.eval('document.title');
  const auth = await cdp.eval('localStorage.getItem("access_token") || localStorage.getItem("auth-token") || localStorage.getItem("token")');
  console.log('Current URL:', url);
  console.log('Page Title:', title);
  console.log('Auth in localStorage:', Boolean(auth));

  await cdp.screenshot('check-auth.png');
  cdp.close();
}

run().catch(console.error);
