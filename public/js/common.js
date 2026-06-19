// Common utilities — shared across all pages.
// Loaded as a regular <script> (no module system).
(function () {
  'use strict';

  // ============ API helpers ============

  const API = {
    async request(method, path, { body, headers, isForm } = {}) {
      const opts = { method, headers: { ...(headers || {}) } };
      if (body !== undefined && !isForm) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
      } else if (isForm) {
        opts.body = body;
      }
      const res = await fetch(path, opts);
      const text = await res.text();
      let json;
      try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
      if (!res.ok) {
        const err = new Error((json && (json.error || json.message)) || `HTTP ${res.status}`);
        err.status = res.status;
        err.body = json;
        throw err;
      }
      return json;
    },
    get(p, opts) { return this.request('GET', p, opts); },
    post(p, body, opts) { return this.request('POST', p, { ...opts, body }); },
    put(p, body, opts) { return this.request('PUT', p, { ...opts, body }); },
    patch(p, body, opts) { return this.request('PATCH', p, { ...opts, body }); },
    del(p, opts) { return this.request('DELETE', p, opts); },
  };
  window.API = API;

  // ============ Auth/PIN management ============

  const PIN_KEY = 'tardiness_admin_pin';
  function getPin() { return sessionStorage.getItem(PIN_KEY) || ''; }
  function setPin(pin) {
    if (pin) sessionStorage.setItem(PIN_KEY, pin);
    else sessionStorage.removeItem(PIN_KEY);
  }
  function authHeaders() {
    const pin = getPin();
    return pin ? { 'X-Admin-Pin': pin } : {};
  }
  async function authedRequest(method, path, opts = {}) {
    return API.request(method, path, { ...opts, headers: { ...authHeaders(), ...(opts.headers || {}) } });
  }
  async function pingPin() {
    try {
      await authedRequest('GET', '/api/config/all');
      return true;
    } catch (e) {
      if (e.status === 401) return false;
      throw e;
    }
  }
  window.Auth = { getPin, setPin, pingPin, authHeaders, authedRequest };

  // ============ Toast / Undo ============

  function showToast({ message, type = 'default', duration = 4000, actions = [] }) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast' + (type !== 'default' ? ' ' + type : '');
    const msg = document.createElement('span');
    msg.textContent = message;
    toast.appendChild(msg);
    if (actions.length) {
      const act = document.createElement('div');
      act.className = 'toast-actions';
      actions.forEach(a => {
        const btn = document.createElement('button');
        btn.textContent = a.label;
        btn.addEventListener('click', () => {
          try { a.onClick && a.onClick(); } finally { dismiss(); }
        });
        act.appendChild(btn);
      });
      toast.appendChild(act);
    }
    container.appendChild(toast);
    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 200ms';
      setTimeout(() => toast.remove(), 250);
    };
    if (duration > 0) setTimeout(dismiss, duration);
    return { dismiss };
  }
  window.toast = showToast;

  // ============ Modal ============

  function showModal({ title, body, actions = [], dismissible = true }) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    const modal = document.createElement('div');
    modal.className = 'modal';
    if (title) {
      const h = document.createElement('h2');
      h.textContent = title;
      modal.appendChild(h);
    }
    if (typeof body === 'string') {
      const p = document.createElement('p');
      p.textContent = body;
      modal.appendChild(p);
    } else if (body instanceof HTMLElement) {
      modal.appendChild(body);
    }
    if (actions.length) {
      const row = document.createElement('div');
      row.className = 'modal-actions';
      actions.forEach(a => {
        const btn = document.createElement('button');
        btn.textContent = a.label;
        btn.className = a.class || '';
        btn.addEventListener('click', async () => {
          try {
            const r = await a.onClick && a.onClick();
            if (r !== false) close();
          } catch (e) {
            toast({ message: e.message || 'error', type: 'error' });
          }
        });
        row.appendChild(btn);
      });
      modal.appendChild(row);
    }
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    const close = () => backdrop.remove();
    if (dismissible) {
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
    }
    return { close, backdrop, modal };
  }
  window.showModal = showModal;

  function confirmModal({ title, message, confirmLabel = 'Confirm', danger = false }) {
    return new Promise(resolve => {
      showModal({
        title,
        body: message,
        actions: [
          { label: 'Cancel', onClick: () => { resolve(false); return false; } },
          { label: confirmLabel, class: danger ? 'danger' : 'primary', onClick: () => { resolve(true); } },
        ],
      });
    });
  }
  window.confirmModal = confirmModal;

  // ============ Topbar / Footer / Common layout ============

  function renderTopbar({ active = '', schoolName = '', backup = null } = {}) {
    const bar = document.createElement('div');
    bar.className = 'topbar';
    bar.innerHTML = `
      <div>
        <h1>Tardiness Check</h1>
        <div class="school-name">${escapeHtml(schoolName || 'School not set')}</div>
      </div>
      <div class="spacer"></div>
      ${backupBadge(backup)}
      <nav>
        <a href="/index.html" class="${active === 'mark' ? 'active' : ''}">Mark Late</a>
        <a href="/roster.html" class="${active === 'roster' ? 'active' : ''}">Roster</a>
        <a href="/reports.html" class="${active === 'reports' ? 'active' : ''}">Reports</a>
        <a href="/settings.html" class="${active === 'settings' ? 'active' : ''}">Settings</a>
      </nav>
    `;
    return bar;
  }
  function backupBadge(backup) {
    if (!backup) return '<span class="backup-status"><span class="dot"></span> backup: …</span>';
    let cls = 'never';
    let label = 'no backup yet';
    if (backup.last_backup) {
      const ageMs = Date.now() - new Date(backup.last_backup).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      if (ageDays < 1) { cls = 'ok'; label = 'backup: today'; }
      else if (ageDays < 7) { cls = 'ok'; label = `backup: ${Math.floor(ageDays)}d ago`; }
      else { cls = 'warn'; label = `backup: ${Math.floor(ageDays)}d ago`; }
    }
    return `<span class="backup-status ${cls}" title="last backup: ${backup.last_backup || 'never'}"><span class="dot"></span> ${label}</span>`;
  }
  function renderFooter() {
    const bar = document.createElement('div');
    bar.className = 'footer-bar';
    bar.innerHTML = `
      <div>
        <span id="version-info">v…</span>
        <span class="muted"> · </span>
        <span id="footer-year"></span>
      </div>
      <div class="footer-actions">
        <button class="ghost" id="btn-get-help">Get Help</button>
        <button class="ghost" id="btn-logout" hidden>Log out</button>
      </div>
    `;
    return bar;
  }
  window.Layout = { renderTopbar, renderFooter, backupBadge };

  // ============ Footer wiring (Get Help, version, logout) ============

  async function wireFooter() {
    try {
      const d = await API.get('/api/diagnostics/text');
      const v = document.getElementById('version-info');
      if (v) v.textContent = 'v' + (d.match(/App version:\s+(\S+)/)?.[1] || '?');
    } catch { /* offline */ }
    const y = document.getElementById('footer-year');
    if (y) y.textContent = `© ${new Date().getFullYear()}`;

    const helpBtn = document.getElementById('btn-get-help');
    if (helpBtn) helpBtn.addEventListener('click', showGetHelp);

    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
      if (getPin()) logoutBtn.hidden = false;
      logoutBtn.addEventListener('click', () => {
        setPin('');
        toast({ message: 'Logged out' });
        window.location.href = '/login.html';
      });
    }
  }
  async function showGetHelp() {
    showModal({
      title: 'Get Help',
      body: 'This will copy a diagnostics report to your clipboard — paste it into a message to your support contact.\n\nIt includes server version, database size, recent activity, and any error messages.',
      actions: [
        { label: 'Cancel' },
        { label: 'Copy to clipboard', class: 'primary', onClick: async () => {
          try {
            const text = await API.get('/api/diagnostics/text');
            await navigator.clipboard.writeText(text);
            toast({ message: 'Diagnostics copied — paste into your message', type: 'success', duration: 5000 });
          } catch (e) {
            toast({ message: `Could not copy: ${e.message}`, type: 'error' });
            throw e;  // keep modal open on error
          }
        }},
      ],
    });
  }
  window.wireFooter = wireFooter;
  window.showGetHelp = showGetHelp;

  // ============ Audio (beep on success) ============

  let audioCtx = null;
  function beep() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.value = 0.06;
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      setTimeout(() => { osc.stop(); }, 80);
    } catch { /* silent fail */ }
  }
  window.beep = beep;

  // ============ HTML escaping ============

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  window.escapeHtml = escapeHtml;

  // ============ Badges (late count → color) ============

  function lateBadge(n) {
    if (n == null) n = 0;
    if (n === 0) return `<span class="badge late-0">0</span>`;
    if (n <= 2) return `<span class="badge late-low">${n}</span>`;
    if (n <= 4) return `<span class="badge late-mid">${n}</span>`;
    return `<span class="badge late-high">${n}</span>`;
  }
  window.lateBadge = lateBadge;

  // ============ Boot (wire footer + toast container) ============

  document.addEventListener('DOMContentLoaded', () => {
    // Ensure toast container exists
    if (!document.getElementById('toast-container')) {
      const c = document.createElement('div');
      c.id = 'toast-container';
      document.body.appendChild(c);
    }
    wireFooter();
  });
})();
