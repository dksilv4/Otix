import http from 'http';

function getPages() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function main() {
  const pages = await getPages();
  const page = pages.find(p => p.type === 'page' && p.webSocketDebuggerUrl);
  const ws = new globalThis.WebSocket(page.webSocketDebuggerUrl);
  let id = 1;
  const pending = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(msg.error);
      else resolve(msg.result);
    }
  };
  const send = (method, params = {}) => {
    return new Promise((resolve, reject) => {
      const msgId = id++;
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  };
  await new Promise(r => ws.onopen = r);

  // 1. Open the stream player
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const streamBtn = Array.from(document.querySelectorAll('button, a')).find(b => (b.innerText || '').includes('Stream Now'));
        if (streamBtn) streamBtn.click();
      })()
    `,
    returnByValue: true
  });

  await new Promise(r => setTimeout(r, 1200));

  // 2. Inspect player in default mode
  const defaultMode = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const modal = document.querySelector('.fixed.inset-0');
        const video = document.querySelector('video');
        const controls = document.querySelector('.relative.h-11')?.parentElement;
        const scrubber = document.querySelector('[role="slider"]');
        const bars = scrubber ? scrubber.querySelectorAll('.rounded-full') : [];
        const titleEl = controls ? controls.querySelector('.text-foreground') : null;
        
        const scrubberRect = scrubber ? scrubber.getBoundingClientRect() : null;
        const lastBar = bars.length > 0 ? bars[bars.length - 1].getBoundingClientRect() : null;
        const isOverflowing = scrubberRect && lastBar ? lastBar.right > (scrubberRect.right + 2) : false;

        const textSamples = Array.from((controls || document).querySelectorAll('span, button, p'))
          .filter(el => el.children.length === 0 && (el.innerText || '').trim().length > 0)
          .slice(0, 10)
          .map(el => ({
            text: el.innerText.trim(),
            color: window.getComputedStyle(el).color,
            class: el.className
          }));

        return {
          windowWidth: window.innerWidth,
          windowHeight: window.innerHeight,
          hasModal: !!modal,
          hasVideo: !!video,
          controlsWidth: controls ? controls.getBoundingClientRect().width : null,
          scrubberWidth: scrubberRect ? scrubberRect.width : null,
          barsCount: bars.length,
          isOverflowing,
          textSamples
        };
      })()
    `,
    returnByValue: true
  });

  console.log('Default mode state:', JSON.stringify(defaultMode.result.value, null, 2));

  // 3. Toggle Theater Mode
  const theaterClick = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const theaterBtn = document.querySelector('button[title*="theater" i], button[aria-label*="theater" i]');
        if (theaterBtn) {
          theaterBtn.click();
          return 'Clicked theater button';
        }
        return 'Theater button not found';
      })()
    `,
    returnByValue: true
  });

  console.log('Theater click:', theaterClick.result.value);

  await new Promise(r => setTimeout(r, 800));

  // 4. Inspect player in Theater mode
  const theaterMode = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const modal = document.querySelector('.fixed.inset-0');
        const video = document.querySelector('video');
        const videoBox = video ? video.getBoundingClientRect() : null;
        const controls = document.querySelector('.relative.h-11')?.parentElement;
        const controlsBox = controls ? controls.getBoundingClientRect() : null;
        const scrubber = document.querySelector('[role="slider"]');
        const scrubberRect = scrubber ? scrubber.getBoundingClientRect() : null;
        const bars = scrubber ? scrubber.querySelectorAll('.rounded-full') : [];
        const lastBar = bars.length > 0 ? bars[bars.length - 1].getBoundingClientRect() : null;
        const isOverflowing = scrubberRect && lastBar ? lastBar.right > (scrubberRect.right + 2) : false;

        return {
          windowWidth: window.innerWidth,
          windowHeight: window.innerHeight,
          videoBox,
          controlsBox,
          scrubberWidth: scrubberRect ? scrubberRect.width : null,
          barsCount: bars.length,
          isOverflowing
        };
      })()
    `,
    returnByValue: true
  });

  console.log('Theater mode state:', JSON.stringify(theaterMode.result.value, null, 2));

  ws.close();
}

main().catch(console.error);
