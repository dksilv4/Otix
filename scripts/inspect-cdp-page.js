const wsUrl = 'ws://127.0.0.1:9222/devtools/page/EC070DC2668D7238B92E708E9D4A519E';

const ws = new WebSocket(wsUrl);

ws.onopen = () => {
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: 'document.title + " | " + window.location.href' } }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id === 1) {
    console.log('Page info:', msg.result?.result?.value);
    ws.close();
  }
};
