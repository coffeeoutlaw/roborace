# Sharing Robo Race with friends

Online play is one Node process: it serves the game **and** hosts the matches.
A friend only needs the URL — nothing to install, any modern browser works.

How a match starts: you click **🌐 Play online → Create room**, send your friend the
invite link (it looks like `https://…/?room=ABCD`), they type a name and land in your
lobby. Host picks the course, empty seats can be AI, and off you go. If someone's
browser hiccups they can reload — the game reconnects them automatically, and if they
vanish entirely the AI takes their robot over after a grace period.

---

## Option 1 — play RIGHT NOW from your PC (free, no account)

Your PC acts as the server for the evening; the tunnel gives it a temporary public URL.

```powershell
cd C:\Users\thunt\robogame\roborally
npm run online        # builds the client + starts the server on http://localhost:5202
```

Then in a second terminal:

```powershell
winget install Cloudflare.cloudflared      # one-time install
cloudflared tunnel --url http://localhost:5202
```

cloudflared prints a URL like `https://random-words.trycloudflare.com` — that's your
game. Open it yourself, create a room, and send the invite link to your friend.
The URL dies when you stop cloudflared; your PC must stay on while you play.

### Same WiFi instead? Skip the tunnel.
Run `npm run online`, find your LAN address with `ipconfig` (IPv4, e.g. 192.168.1.23),
and your friend opens `http://192.168.1.23:5202`. Allow it through the Windows
firewall prompt the first time.

## Option 2 — permanent free hosting (always online, no PC needed)

[Render](https://render.com) free tier runs Node + WebSockets:

1. Put the `roborally/` folder in a GitHub repo and push it.
2. On Render: **New → Web Service**, connect the repo.
3. Settings: Build command `npm install && npm run build` · Start command
   `node server/server.js` (the server reads Render's `PORT` automatically).
4. Deploy. Your game lives at `https://your-name.onrender.com` forever.

Free-tier note: the service sleeps when idle — the first visit takes ~30s to wake,
after that it's instant. Railway.app and Fly.io work the same way if you prefer them.

## Just the solo game (no server)

The single-player vs-AI game is pure static files: `npm run build`, then host the
`dist/` folder anywhere (itch.io, GitHub Pages, Netlify). The 🌐 online button will
say it can't reach a server, but local races work fully.

---

## Dev notes

- Dev mode: vite (`npm run dev`, port 5201) proxies `/ws` to the game server
  (`npm run server`, port 5202) — run both. In the Claude preview these are the
  `roborally` and `roborally-server` launch configs.
- `node server/devbot.js ROOMCODE` joins a scripted opponent for solo testing.
- Room codes are 4 letters; rooms evaporate 5 minutes after everyone disconnects.
- The server is authoritative: clients only ever receive their own hand, public
  robot state, and the animation event stream (see `tests/online.test.js`).
