// Robo Race online server: one Node process serves the built client (dist/) and
// hosts the WebSocket matches at /ws. Usage: node server/server.js  (PORT env, default 5202)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Room, RoomError } from './room.js';

const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.json': 'application/json', '.map': 'application/json', '.woff2': 'font/woff2',
};
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function createGameServer({ port = 0, roomOpts = {} } = {}) {
  const rooms = new Map();

  const genCode = () => {
    for (;;) {
      let c = '';
      for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      if (!rooms.has(c)) return c;
    }
  };

  const dropEmptyRoomSoon = (room) => {
    // everyone disconnected — keep the room 5 minutes in case of reconnects
    setTimeout(() => {
      const anyConnected = [...room.players.values()].some((p) => p.connected);
      if (!anyConnected && rooms.get(room.code) === room) {
        room.destroy();
        rooms.delete(room.code);
      }
    }, 5 * 60_000).unref?.();
  };

  const httpServer = http.createServer(async (req, res) => {
    // dev-only: lets the client (or test tooling) drop a rendered frame to disk,
    // so the 3D scene can be inspected even when the preview tab can't screenshot
    if (req.url === '/debug/shot') {
      res.setHeader('access-control-allow-origin', '*');
      res.setHeader('access-control-allow-methods', 'POST, OPTIONS');
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      if (req.method === 'POST') {
        let body = '';
        req.on('data', (c) => { body += c; if (body.length > 8e6) req.destroy(); });
        req.on('end', async () => {
          try {
            const b64 = body.replace(/^data:image\/\w+;base64,/, '');
            const file = path.join(DIST, '..', '.debug-shot.png');
            await import('node:fs/promises').then((fs) => fs.writeFile(file, Buffer.from(b64, 'base64')));
            res.writeHead(200); res.end('saved');
          } catch { res.writeHead(500); res.end(); }
        });
        return;
      }
    }
    if (!existsSync(DIST)) {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('Robo Race server is running. Client not built — run `npm run build` (dev mode: use the Vite server).');
      return;
    }
    try {
      const url = new URL(req.url, 'http://x');
      let p = path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
      if (p === '' || p === '.') p = 'index.html';
      let file = path.join(DIST, p);
      if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
      if (!existsSync(file)) file = path.join(DIST, 'index.html'); // SPA fallback
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(500);
      res.end();
    }
  });

  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (socket) => {
    socket.isAlive = true;
    socket.on('pong', () => { socket.isAlive = true; });

    socket.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(String(data)); } catch { return; }
      try {
        route(socket, msg);
      } catch (e) {
        const text = e instanceof RoomError ? e.message : 'Server error';
        if (!(e instanceof RoomError)) console.error(e);
        socket.send(JSON.stringify({ t: 'error', msg: text }));
      }
    });

    socket.on('close', () => {
      if (socket.room) socket.room.removeSocket(socket);
    });
  });

  function route(socket, msg) {
    const room = socket.room;
    switch (msg.t) {
      case 'create': {
        const r = new Room(genCode(), { ...roomOpts, onEmpty: dropEmptyRoomSoon });
        rooms.set(r.code, r);
        const p = r.addPlayer(socket, msg.name);
        socket.room = r;
        socket.playerId = p.id;
        socket.send(JSON.stringify({ t: 'welcome', code: r.code, playerId: p.id, key: p.key }));
        break;
      }
      case 'join': {
        const r = rooms.get(String(msg.code || '').toUpperCase().trim());
        if (!r) throw new RoomError('No room with that code');
        const p = r.addPlayer(socket, msg.name);
        socket.room = r;
        socket.playerId = p.id;
        socket.send(JSON.stringify({ t: 'welcome', code: r.code, playerId: p.id, key: p.key }));
        break;
      }
      case 'rejoin': {
        const r = rooms.get(String(msg.code || '').toUpperCase().trim());
        if (!r) throw new RoomError('That game is gone');
        const p = r.rejoin(socket, msg.playerId, msg.key);
        socket.room = r;
        socket.playerId = p.id;
        socket.send(JSON.stringify({ t: 'welcome', code: r.code, playerId: p.id, key: p.key, rejoined: true }));
        break;
      }
      case 'config': room?.config(socket.playerId, msg); break;
      case 'start': room?.start(socket.playerId); break;
      case 'bid': room?.handleBid(socket.playerId, msg.priority); break;
      case 'pick': room?.handlePick(socket.playerId, msg.dock); break;
      case 'program': room?.handleProgram(socket.playerId, msg.priorities, msg.powerDown); break;
      case 'choice': room?.handleChoice(socket.playerId, msg.choice); break;
      case 'backToLobby': room?.backToLobby(socket.playerId); break;
      default: break;
    }
  }

  // heartbeat: drop dead sockets so disconnect grace timers actually fire
  const beat = setInterval(() => {
    for (const s of wss.clients) {
      if (!s.isAlive) { s.terminate(); continue; }
      s.isAlive = false;
      s.ping();
    }
  }, 30_000);
  beat.unref?.();

  return new Promise((resolve) => {
    httpServer.listen(port, () => {
      resolve({
        httpServer,
        wss,
        rooms,
        port: httpServer.address().port,
        close: () => new Promise((r) => {
          clearInterval(beat);
          for (const room of rooms.values()) room.destroy();
          for (const s of wss.clients) s.terminate();
          wss.close(() => httpServer.close(r));
        }),
      });
    });
  });
}

// run directly: node server/server.js
if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href) {
  const port = Number(process.env.PORT) || 5202;
  createGameServer({ port }).then((s) => {
    console.log(`Robo Race server listening on http://localhost:${s.port} (ws at /ws)`);
  });
}
