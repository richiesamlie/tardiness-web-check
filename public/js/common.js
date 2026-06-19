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

  // ============ Icons (inline SVG, no deps) ============
  // Lucide-style stroke icons, 24x24, currentColor.
  // Add more as needed; keep strokeWidth 2 for visual consistency.
  const ICONS = {
    search:      '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    plus:        '<path d="M12 5v14M5 12h14"/>',
    pencil:      '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
    trash:       '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
    download:    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    upload:      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
    file:        '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
    users:       '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    user:        '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    clock:       '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    chart:       '<path d="M3 3v18h18"/><path d="M7 16V8"/><path d="M11 16v-5"/><path d="M15 16v-2"/><path d="M19 16v-7"/>',
    settings:    '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    home:        '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    check:       '<polyline points="20 6 9 17 4 12"/>',
    x:           '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    alert:       '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    info:        '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
    markLate:    '<circle cx="12" cy="12" r="9"/><line x1="12" y1="7" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    school:      '<path d="M14 22v-4a2 2 0 0 0-2-2H4v-7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7h-4a2 2 0 0 0-2 2v4Z"/><path d="M18 22h4v-7a2 2 0 0 0-2-2h-2"/><path d="M14 22h-4"/><path d="M6 12V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v7"/>',
    calendar:    '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    pin:         '<line x1="12" y1="17" x2="12" y2="22"/><path d="M5 8a7 7 0 0 1 14 0c0 5-7 9-7 9s-7-4-7-9z"/><circle cx="12" cy="8" r="2"/>',
    lock:        '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    shield:      '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    copy:        '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    refresh:     '<path d="M21 12a9 9 0 0 0-15-6.7L3 8"/><path d="M3 3v5h5"/><path d="M21 21v-5h-5"/><path d="M21 16a9 9 0 0 1-15 6.7l-3-2.7"/>',
    chevronDown: '<polyline points="6 9 12 15 18 9"/>',
    chevronRight:'<polyline points="9 18 15 12 9 6"/>',
    userPlus:    '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>',
    save:        '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
    help:        '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    archive:     '<polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>',
    restart:     '<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/>',
    inboxes:     '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    star:        '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    warning:     '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    listChecks:  '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
    gradCap:     '<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 10 3 12 0v-5"/>',
  };

  function icon(name, size = 18) {
    const svg = ICONS[name] || ICONS.alert;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${svg}</svg>`;
  }
  window.icon = icon;
  window.ICONS = ICONS;

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

  function iconForType(type) {
    if (type === 'success') return 'check';
    if (type === 'error') return 'alert';
    if (type === 'undo') return 'refresh';
    return 'info';
  }
  function showToast({ message, type = 'default', duration = 4000, actions = [] }) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast' + (type !== 'default' ? ' ' + type : '');
    const iconWrap = document.createElement('span');
    iconWrap.className = 'toast-icon';
    iconWrap.innerHTML = icon(iconForType(type), 20);
    toast.appendChild(iconWrap);
    const msg = document.createElement('span');
    msg.className = 'toast-msg';
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
      toast.style.animation = 'toast-out 180ms ease forwards';
      setTimeout(() => toast.remove(), 200);
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

  // ============ Class color helper (deterministic per class name) ============

  function classColor(className) {
    if (!className) return 'var(--c-class-1)';
    let hash = 0;
    for (let i = 0; i < className.length; i++) hash = ((hash << 5) - hash) + className.charCodeAt(i);
    const palette = ['--c-class-1', '--c-class-2', '--c-class-3', '--c-class-4', '--c-class-5', '--c-class-6', '--c-class-7', '--c-class-8'];
    return `var(${palette[Math.abs(hash) % palette.length]})`;
  }
  window.classColor = classColor;

  // ============ Topbar / Footer / Common layout ============

  function renderTopbar({ active = '', schoolName = '', backup = null } = {}) {
    const bar = document.createElement('div');
    bar.className = 'topbar';
    bar.innerHTML = `
      <div class="topbar-brand">
        <div class="logo">TC</div>
        <div>
          <h1>Tardiness Check</h1>
          <div class="school-name">${escapeHtml(schoolName || 'School not set')}</div>
        </div>
      </div>
      <div class="spacer"></div>
      ${backupBadge(backup)}
      <nav>
        <a href="/index.html" class="${active === 'mark' ? 'active' : ''}">${icon('markLate', 16)} <span class="label">Mark Late</span></a>
        <a href="/roster.html" class="${active === 'roster' ? 'active' : ''}">${icon('users', 16)} <span class="label">Roster</span></a>
        <a href="/reports.html" class="${active === 'reports' ? 'active' : ''}">${icon('chart', 16)} <span class="label">Reports</span></a>
        <a href="/settings.html" class="${active === 'settings' ? 'active' : ''}">${icon('settings', 16)} <span class="label">Settings</span></a>
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
        <button class="ghost" id="btn-get-help">${icon('help', 16)} Get Help</button>
        <button class="ghost" id="btn-logout" hidden>${icon('x', 16)} Log out</button>
      </div>
    `;
    return bar;
  }
  window.Layout = { renderTopbar, renderFooter, backupBadge };

  // ============ Empty state helper ============

  function emptyState({ icon: iconName = 'inboxes', title, message, action }) {
    const el = document.createElement('div');
    el.className = 'empty-state';
    el.innerHTML = `
      <div class="empty-icon">${icon(iconName, 32)}</div>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(message)}</p>
      ${action ? '' : ''}
    `;
    if (action) {
      const btn = document.createElement('button');
      btn.className = 'primary';
      btn.innerHTML = `${icon(action.icon || 'plus', 16)} ${escapeHtml(action.label)}`;
      btn.addEventListener('click', action.onClick);
      el.appendChild(btn);
    }
    return el;
  }
  window.emptyState = emptyState;

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
            throw e;
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

  // ============ Badges (late count → color tier) ============

  function lateBadge(n) {
    if (n == null) n = 0;
    const tier = n === 0 ? 0 : (n <= 2 ? 1 : n <= 4 ? 2 : 3);
    return `<span class="badge tier-${tier}">${n}</span>`;
  }
  window.lateBadge = lateBadge;

  // ============ Boot (wire footer + toast container) ============

  document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('toast-container')) {
      const c = document.createElement('div');
      c.id = 'toast-container';
      document.body.appendChild(c);
    }
    wireFooter();
  });
})();
