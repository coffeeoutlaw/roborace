// Online lobby overlay: connect (name + create/join) and room (code, roster,
// course pick, start). Re-renders on every lobby broadcast, so no internal state
// beyond the inputs the player is typing into.
export class Lobby {
  // cb: { onCreate(name), onJoin(name, code), onConfig({courseIndex,fillAI}), onStart(), onLeave() }
  constructor(cb) {
    this.cb = cb;
    this.courses = []; // injected (course metadata for the picker)
    this.root = document.createElement('div');
    this.root.id = 'lobby';
    this.root.className = 'modal-wrap hidden';
    document.body.appendChild(this.root);
  }

  get visible() { return !this.root.classList.contains('hidden'); }
  hide() { this.root.classList.add('hidden'); }

  setStatus(text) {
    const el = this.root.querySelector('.lobby-status');
    if (el) el.textContent = text;
  }

  #name() {
    return (this.root.querySelector('#lb-name')?.value || localStorage.getItem('rr-name') || '').trim();
  }

  showConnect(prefillCode = '', status = '') {
    this.root.classList.remove('hidden');
    const savedName = localStorage.getItem('rr-name') || '';
    this.root.innerHTML = `
      <div class="modal lobby-modal">
        <h2>🌐 Play online</h2>
        <label class="lobby-label">Your name
          <input id="lb-name" maxlength="14" placeholder="RoboPilot" value="${escapeAttr(savedName)}">
        </label>
        <div class="lobby-cols">
          <div class="lobby-col">
            <h3>Start a game</h3>
            <p class="lobby-hint">You get a room code to send to a friend.</p>
            <button id="lb-create" class="lockin">Create room</button>
          </div>
          <div class="lobby-col">
            <h3>Join a game</h3>
            <label class="lobby-label">Room code
              <input id="lb-code" maxlength="4" placeholder="ABCD" value="${escapeAttr(prefillCode)}">
            </label>
            <button id="lb-join">Join room</button>
          </div>
        </div>
        <div class="lobby-status">${escapeHtml(status)}</div>
        <div class="btn-row"><button id="lb-back">← Back to menu</button></div>
      </div>`;
    const nameEl = this.root.querySelector('#lb-name');
    const remember = () => localStorage.setItem('rr-name', nameEl.value.trim());
    this.root.querySelector('#lb-create').addEventListener('click', () => {
      remember();
      this.setStatus('Creating room…');
      this.cb.onCreate(this.#name());
    });
    this.root.querySelector('#lb-join').addEventListener('click', () => {
      remember();
      const code = this.root.querySelector('#lb-code').value.toUpperCase().trim();
      if (code.length !== 4) { this.setStatus('Room codes are 4 letters.'); return; }
      this.setStatus('Joining…');
      this.cb.onJoin(this.#name(), code);
    });
    this.root.querySelector('#lb-back').addEventListener('click', () => this.cb.onLeave());
    if (prefillCode) this.root.querySelector('#lb-join').focus();
    else nameEl.focus();
  }

  // payload: the server 'lobby' broadcast; myId: my playerId
  showRoom(payload, myId) {
    this.root.classList.remove('hidden');
    const me = payload.players.find((p) => p.id === myId);
    const host = !!me?.isHost;
    const link = `${location.origin}${location.pathname}?room=${payload.code}`;
    this.root.innerHTML = `
      <div class="modal lobby-modal">
        <h2>Room <span class="lobby-code">${payload.code}</span></h2>
        <p class="lobby-hint">Send a friend this link — they open it, type a name, and land here:</p>
        <div class="lobby-linkrow">
          <input id="lb-link" readonly value="${escapeAttr(link)}">
          <button id="lb-copy">Copy</button>
        </div>
        <h3>Pilots (${payload.players.length}/4)</h3>
        <div class="lobby-players">
          ${payload.players.map((p) => `
            <div class="lobby-player${p.connected ? '' : ' off'}">
              <span class="dot" style="background:${p.color}"></span>
              ${escapeHtml(p.name)}${p.isHost ? ' ★' : ''}${p.id === myId ? ' (you)' : ''}
              ${p.connected ? '' : ' — disconnected'}
            </div>`).join('')}
        </div>
        <h3>Course</h3>
        <div class="course-row lobby-courses${host ? '' : ' readonly'}">
          ${this.courses.map((c, i) => `
            <button class="course-card${i === payload.courseIndex ? ' picked' : ''}" data-i="${i}" ${host ? '' : 'disabled'}>
              <div class="course-name">${c.name}</div>
              <div class="course-diff">${'★'.repeat(c.difficulty)}${'☆'.repeat(3 - c.difficulty)}</div>
              <div class="course-flags">${c.flags.length} flags</div>
            </button>`).join('')}
        </div>
        <label class="chk"><input type="checkbox" id="lb-ai" ${payload.fillAI ? 'checked' : ''} ${host ? '' : 'disabled'}>
          Fill empty seats with AI pilots</label>
        <div class="lobby-status"></div>
        <div class="btn-row">
          ${host
    ? '<button id="lb-start" class="lockin">Start race ▶</button>'
    : '<div class="prog-info">Waiting for the host to start…</div>'}
          <button id="lb-leave">Leave</button>
        </div>
      </div>`;
    this.root.querySelector('#lb-copy').addEventListener('click', () => {
      const input = this.root.querySelector('#lb-link');
      input.select();
      navigator.clipboard?.writeText(input.value).catch(() => document.execCommand('copy'));
      this.root.querySelector('#lb-copy').textContent = 'Copied!';
    });
    this.root.querySelector('#lb-leave').addEventListener('click', () => this.cb.onLeave());
    if (host) {
      this.root.querySelectorAll('.course-card').forEach((b) => b.addEventListener('click',
        () => this.cb.onConfig({ courseIndex: Number(b.dataset.i) })));
      this.root.querySelector('#lb-ai').addEventListener('change',
        (e) => this.cb.onConfig({ fillAI: e.target.checked }));
      this.root.querySelector('#lb-start').addEventListener('click', () => {
        this.setStatus('Starting…');
        this.cb.onStart();
      });
    }
  }

  showWaiting(text) {
    this.root.classList.remove('hidden');
    this.root.innerHTML = `
      <div class="modal lobby-modal">
        <h2>${escapeHtml(text)}</h2>
        <div class="btn-row"><button id="lb-leave">Leave</button></div>
      </div>`;
    this.root.querySelector('#lb-leave').addEventListener('click', () => this.cb.onLeave());
  }
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));
const escapeAttr = escapeHtml;
