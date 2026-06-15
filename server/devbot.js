// Dev helper: a scripted opponent that joins a room and plays random legal programs.
// Usage: node server/devbot.js ROOMCODE [name] [ws-url]
// Default url targets the local dev setup (vite on 5201 proxies /ws to 5202).
import WebSocket from 'ws';

const code = (process.argv[2] || '').toUpperCase();
const name = process.argv[3] || 'DevBot';
const url = process.argv[4] || 'ws://localhost:5202/ws';
if (!code) {
  console.error('Usage: node server/devbot.js ROOMCODE [name] [ws-url]');
  process.exit(1);
}

const ws = new WebSocket(url);
const send = (m) => ws.send(JSON.stringify(m));

ws.on('open', () => send({ t: 'join', code, name }));
ws.on('close', () => { console.log('[devbot] socket closed'); process.exit(0); });
ws.on('error', (e) => { console.error('[devbot]', e.message); process.exit(1); });

ws.on('message', (d) => {
  const m = JSON.parse(String(d));
  switch (m.t) {
    case 'welcome': console.log(`[devbot] joined room ${m.code} as ${name}`); break;
    case 'error': console.error('[devbot] server says:', m.msg); break;
    case 'bidStart': {
      if (!m.you?.hand?.length) break;
      const bid = m.you.hand[Math.floor(Math.random() * m.you.hand.length)];
      setTimeout(() => send({ t: 'bid', priority: bid.priority }), 500);
      console.log(`[devbot] bidding ${bid.priority} for start position`);
      break;
    }
    case 'pickDock': {
      const dock = m.free[Math.floor(Math.random() * m.free.length)];
      setTimeout(() => send({ t: 'pick', dock: dock.n }), 500);
      console.log(`[devbot] picking dock ${dock.n}`);
      break;
    }
    case 'turnStart': {
      if (!m.you?.mustProgram) break;
      const hand = [...m.you.hand];
      for (let i = hand.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [hand[i], hand[j]] = [hand[j], hand[i]];
      }
      const picks = hand.slice(0, Math.min(5, hand.length));
      setTimeout(() => send({
        t: 'program', priorities: picks.map((c) => c.priority), powerDown: false,
      }), 800); // a little human hesitation
      console.log(`[devbot] turn ${m.turn}: programming ${picks.length} cards`);
      break;
    }
    case 'needChoice':
      send({ t: 'choice', choice: { dir: Math.floor(Math.random() * 4), powerDown: false, stayDown: false } });
      break;
    case 'gameOver':
      console.log('[devbot] game over:', m.standings.map((s) => `${s.name}${s.winner ? ' 🏁' : ''}`).join(', '));
      break;
    default: break;
  }
});
