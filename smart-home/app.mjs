// Smart Home: dashboard for TP-Link Kasa HS110 plugs. Phase 1: one device type (hs110), built to hold more.
import { Hs110Client, describeError, KasaError } from './hs110.mjs';
import { nativeTransport, unavailableTransport, isNativeAndroid, capacitorPlugin } from './transport.mjs';
import { SimPlug, simTransport } from './sim.mjs';
import { createStore } from './store.mjs';
import { barChart, sparkline } from './charts.mjs';

const VERSION = '1.0.1';
const POLL_MS = 2000;
const STATS_MS = 60000;
const HIST_MAX = 90; // ~3 minutes of live readings kept in memory

const $ = (id) => document.getElementById(id);
const reportError = (m) => (window.__reportError ? window.__reportError(m) : console.error(m));
const store = createStore();
const native = isNativeAndroid();
const params = new URLSearchParams(location.search);
if (!native && params.get('demo') === '1') { store.settings.demo = true; store.saveSettings(); }
if (!native && params.get('demo') === '0') { store.settings.demo = false; store.saveSettings(); }
const demo = !native && store.settings.demo;

// ---- Transport + client -------------------------------------------------------------------------
let plugin = null;
let transport;
let demoPlugs = null;
if (native) {
  plugin = capacitorPlugin('SmartNet');
  transport = nativeTransport(plugin);
} else if (demo) {
  demoPlugs = makeDemoPlugs();
  transport = simTransport(demoPlugs);
} else {
  transport = unavailableTransport();
}
const client = new Hs110Client(transport);

function makeDemoPlugs() {
  return {
    '192.168.1.41': new SimPlug({ alias: 'Office Heater', hw: 1, baseWatts: 1480, swing: 18 }),
    '192.168.1.42': new SimPlug({ alias: 'Living Room TV', hw: 2, baseWatts: 112, swing: 14 }),
    '192.168.1.43': new SimPlug({ alias: 'Garage Freezer', hw: 1, baseWatts: 148, swing: 30, online: false }),
    '192.168.1.44': new SimPlug({ alias: 'Kettle', hw: 1, baseWatts: 9, swing: 2, relay: 0 }),
  };
}
const DEMO_DEVICES = [
  ['192.168.1.41', 'Office Heater'], ['192.168.1.42', 'Living Room TV'], ['192.168.1.43', 'Garage Freezer'], ['192.168.1.44', 'Kettle'],
].map(([host, name]) => ({ id: 'hs110:demo-' + host, type: 'hs110', name, host, model: 'HS110(AU)', hwVer: '', swVer: '', mac: '', addedAt: Date.now() }));

// ---- Device types: the seam where other devices (bulbs, sensors, other brands) plug in later ------
const DRIVERS = {
  hs110: {
    label: 'TP-Link HS110 plug',
    poll: (d) => client.poll(d.host),
    setPower: (d, on) => client.setRelay(d.host, on),
    dayStats: (d, y, m) => client.dayStats(d.host, y, m),
    monthStats: (d, y) => client.monthStats(d.host, y),
  },
};

// ---- Runtime state --------------------------------------------------------------------------------
const live = new Map(); // id -> live status
function liveOf(id) {
  if (!live.has(id)) live.set(id, { status: 'connecting', relayOn: false, watts: null, volts: null, amps: null, totalKwh: null, hasEmeter: true, onTimeSec: null, rssi: null, lastOk: 0, fails: 0, err: null, hist: [], days: null, months: null, todayKwh: null, monthKwh: null, statsAt: 0, pending: false, cmdDoneAt: 0, info: null });
  return live.get(id);
}
const timers = new Map();
const cards = new Map();
let detailId = null;
let detail = null;

// ---- Formatting ---------------------------------------------------------------------------------
const fmtW = (w) => (w == null ? '–' : w === 0 ? '0' : w < 10 ? w.toFixed(1) : String(Math.round(w)));
const fmtKwh = (k) => (k == null ? '–' : k < 10 ? k.toFixed(2) : k.toFixed(1));
const money = (kwh) => (kwh == null ? '' : store.settings.currency + (kwh * store.settings.price).toFixed(2));
function ago(ms) {
  if (!ms) return 'never';
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return s + ' s ago';
  if (s < 3600) return Math.round(s / 60) + ' min ago';
  if (s < 86400) return Math.round(s / 3600) + ' h ago';
  return Math.round(s / 86400) + ' d ago';
}
function onFor(sec) {
  if (sec == null) return '';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h ? `${h} h ${m} m` : `${m} m`;
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}

const ICON = {
  plug: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M8 2v5H6.5A1.5 1.5 0 0 0 5 8.5V12a7 7 0 0 0 5 6.7V22h4v-3.3A7 7 0 0 0 19 12V8.5A1.5 1.5 0 0 0 17.5 7H16V2h-2v5h-4V2zm-1 7h10v3a5 5 0 0 1-10 0z"/></svg>',
  power: '<svg viewBox="0 0 24 24" width="44" height="44" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M12 3v8.5M7.2 6.6a7.5 7.5 0 1 0 9.6 0"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="M15 5l-7 7 7 7"/></svg>',
  plus: '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M12 5v14M5 12h14"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg>',
};

// ---- Theme ----------------------------------------------------------------------------------------
function applyTheme() {
  const t = store.settings.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  const color = dark ? '#0F1419' : '#F2F4F7';
  document.querySelector('meta[name=theme-color]').setAttribute('content', color);
  if (plugin) { try { plugin.setChrome({ color, dark }).catch(() => {}); } catch (e) { /* cosmetic only */ } }
}
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme); } catch (e) { /* old WebView */ }

// ---- Toast ----------------------------------------------------------------------------------------
let toastTimer = 0;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.remove('show'); setTimeout(() => (t.hidden = true), 250); }, 3200);
}

// ---- Polling --------------------------------------------------------------------------------------
function schedule(id, delay) {
  clearTimeout(timers.get(id));
  timers.set(id, setTimeout(() => pollDevice(id), delay));
}

async function pollDevice(id) {
  const dev = store.devices.find((d) => d.id === id);
  if (!dev) return;
  if (document.hidden) { schedule(id, 1000); return; }
  const L = liveOf(id);
  const driver = DRIVERS[dev.type];
  const started = Date.now();
  try {
    const { info, rt } = await driver.poll(dev);
    // A reading that was requested before a switch command finished may still show the old state;
    // trust the relay only if the poll began after the last command completed.
    if (!L.pending && started >= (L.cmdDoneAt || 0)) L.relayOn = info.relayOn;
    L.info = info;
    L.status = 'online';
    L.fails = 0;
    L.err = null;
    L.lastOk = Date.now();
    L.onTimeSec = info.onTimeSec;
    L.rssi = info.rssi;
    L.hasEmeter = info.hasEmeter && !!rt;
    if (rt) {
      L.watts = rt.watts; L.volts = rt.volts; L.amps = rt.amps; L.totalKwh = rt.totalKwh;
      L.hist.push({ t: Date.now(), w: rt.watts || 0 });
      if (L.hist.length > HIST_MAX) L.hist.shift();
    }
    if (info.alias && (!dev.model || dev.model !== info.model || dev.hwVer !== info.hwVer || dev.swVer !== info.swVer || (!dev.mac && info.mac))) {
      Object.assign(dev, { model: info.model, hwVer: info.hwVer, swVer: info.swVer, mac: info.mac || dev.mac, deviceId: info.deviceId || dev.deviceId });
      store.saveDevices();
    }
    if (Date.now() - L.statsAt > STATS_MS && L.hasEmeter) refreshStats(dev).catch(() => {});
  } catch (e) {
    L.fails++;
    L.err = e;
    if (L.fails >= 2 || L.status === 'connecting') L.status = 'offline';
    if (L.status === 'offline') { L.watts = null; }
  }
  updateCard(id);
  if (detailId === id) updateDetail();
  updateSummary();
  const wait = L.status === 'offline' ? (L.fails > 6 ? 10000 : 5000) : Math.max(300, POLL_MS - (Date.now() - started));
  schedule(id, wait);
}

async function refreshStats(dev, force) {
  const L = liveOf(dev.id);
  if (!force && Date.now() - L.statsAt < STATS_MS) return;
  L.statsAt = Date.now();
  const driver = DRIVERS[dev.type];
  const now = new Date();
  try {
    L.days = await driver.dayStats(dev, now.getFullYear(), now.getMonth() + 1);
    const today = L.days.find((d) => d.day === now.getDate());
    L.todayKwh = today ? today.kwh : 0;
    L.monthKwh = L.days.reduce((a, d) => a + d.kwh, 0);
  } catch (e) { L.statsAt = Date.now() - STATS_MS + 8000; /* retry sooner */ }
  if (detailId === dev.id) {
    try { L.months = await driver.monthStats(dev, now.getFullYear()); } catch (e) { /* keep old */ }
  }
  updateCard(dev.id);
  if (detailId === dev.id) updateDetail();
  updateSummary();
}

function pollAll(immediate = true) {
  for (const d of store.devices) if (immediate) schedule(d.id, 0);
}

document.addEventListener('visibilitychange', () => { if (!document.hidden) pollAll(); });
addEventListener('online', () => pollAll());

// If a plug's IP changed (DHCP), find it again by its MAC address.
let rediscovering = false;
async function rediscoverLoop() {
  setInterval(async () => {
    if (rediscovering || document.hidden) return;
    const lost = store.devices.filter((d) => liveOf(d.id).status === 'offline' && liveOf(d.id).fails >= 3 && d.mac);
    if (!lost.length) return;
    rediscovering = true;
    try {
      const found = await client.discover({ timeoutMs: 2000, sweep: false });
      for (const dev of lost) {
        const hit = found.find((f) => f.info.mac && f.info.mac === dev.mac && f.host !== dev.host);
        if (hit) { dev.host = hit.host; store.saveDevices(); toast(`${dev.name} moved to ${hit.host}`); schedule(dev.id, 0); }
      }
    } catch (e) { /* try again later */ } finally { rediscovering = false; }
  }, 45000);
}

// ---- Switching ------------------------------------------------------------------------------------
async function setPower(id, on) {
  const dev = store.devices.find((d) => d.id === id);
  const L = liveOf(id);
  if (!dev) return;
  if (L.status !== 'online') { toast(`${dev.name} is offline`); shake(id); return; }
  const before = L.relayOn;
  L.relayOn = on;
  L.pending = true;
  if (!on) L.watts = 0;
  updateCard(id); if (detailId === id) updateDetail(); updateSummary();
  if (navigator.vibrate) navigator.vibrate(12);
  try {
    await DRIVERS[dev.type].setPower(dev, on);
    L.pending = false;
    L.cmdDoneAt = Date.now();
    schedule(id, 150); // confirm with a fresh reading straight away
  } catch (e) {
    L.relayOn = before;
    L.pending = false;
    L.cmdDoneAt = Date.now();
    toast("Couldn't switch it: " + describeError(e));
    updateCard(id); if (detailId === id) updateDetail(); updateSummary();
  }
}

function shake(id) {
  const c = cards.get(id);
  if (!c) return;
  c.root.classList.remove('shake'); void c.root.offsetWidth; c.root.classList.add('shake');
}

// ---- Dashboard ------------------------------------------------------------------------------------
function buildCard(dev) {
  const sw = h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-label': 'Power', 'aria-checked': 'false' }, h('span', { class: 'knob' }));
  sw.addEventListener('click', (ev) => { ev.stopPropagation(); setPower(dev.id, !liveOf(dev.id).relayOn); });
  const c = {
    root: h('article', { class: 'card device', tabindex: '0', role: 'button', 'aria-label': dev.name }),
    icon: h('div', { class: 'dev-icon', html: ICON.plug }),
    name: h('div', { class: 'dev-name' }),
    sub: h('div', { class: 'dev-sub muted' }),
    sw,
    watts: h('span', { class: 'watts-num' }),
    unit: h('span', { class: 'watts-unit' }, 'W'),
    today: h('span', { class: 'v' }),
    month: h('span', { class: 'v' }),
    status: h('div', { class: 'status' }),
  };
  c.root.append(
    h('div', { class: 'row' }, c.icon, h('div', { class: 'grow' }, c.name, c.sub), sw),
    h('div', { class: 'watts' }, c.watts, c.unit),
    h('div', { class: 'mini' },
      h('div', {}, h('span', { class: 'k muted' }, 'Today'), c.today),
      h('div', {}, h('span', { class: 'k muted' }, 'This month'), c.month)),
    c.status,
  );
  const open = () => openDetail(dev.id);
  c.root.addEventListener('click', open);
  c.root.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  return c;
}

function updateCard(id) {
  const c = cards.get(id);
  const dev = store.devices.find((d) => d.id === id);
  if (!c || !dev) return;
  const L = liveOf(id);
  const online = L.status === 'online';
  c.name.textContent = dev.name;
  c.root.classList.toggle('on', online && L.relayOn);
  c.root.classList.toggle('off', online && !L.relayOn);
  c.root.classList.toggle('offline', L.status === 'offline');
  c.root.classList.toggle('connecting', L.status === 'connecting');
  c.sw.setAttribute('aria-checked', String(online && L.relayOn));
  c.sw.disabled = false;
  c.sw.classList.toggle('disabled', !online);
  c.sub.textContent = L.status === 'offline' ? 'Offline' : L.status === 'connecting' ? 'Connecting…' : L.relayOn ? 'On' : 'Off';
  c.watts.textContent = online && L.hasEmeter ? fmtW(L.relayOn ? L.watts : 0) : '–';
  c.unit.hidden = !(online && L.hasEmeter);
  c.today.textContent = L.todayKwh == null ? '–' : `${fmtKwh(L.todayKwh)} kWh`;
  c.month.textContent = L.monthKwh == null ? '–' : `${fmtKwh(L.monthKwh)} kWh`;
  c.status.textContent = L.status === 'offline' ? (L.lastOk ? `Last seen ${ago(L.lastOk)}` : "Hasn't connected yet") : L.todayKwh != null ? `Est. ${money(L.todayKwh)} today` : '';
}

function renderGrid() {
  const grid = $('grid');
  grid.textContent = '';
  cards.clear();
  for (const dev of store.devices) {
    const c = buildCard(dev);
    cards.set(dev.id, c);
    grid.append(c.root);
    updateCard(dev.id);
  }
  grid.append(h('button', { class: 'card add-card', type: 'button', onclick: openAddSheet, 'aria-label': 'Add a device' },
    h('span', { class: 'add-plus', html: ICON.plus }),
    h('span', { class: 'add-title' }, store.devices.length ? 'Add a device' : 'Add your first device'),
    h('span', { class: 'muted small' }, 'Find it on your Wi-Fi or enter its IP')));
  updateSummary();
}

function updateSummary() {
  const devs = store.devices;
  const sum = $('summary');
  const sub = $('subtitle');
  if (!devs.length) { sum.hidden = true; sub.textContent = 'No devices yet'; showBanner(null); return; }
  sum.hidden = false;
  const lives = devs.map((d) => liveOf(d.id));
  const online = lives.filter((l) => l.status === 'online');
  const connecting = lives.filter((l) => l.status === 'connecting').length;
  const watts = online.reduce((a, l) => a + (l.hasEmeter && l.relayOn ? l.watts || 0 : 0), 0);
  const todayKnown = lives.filter((l) => l.todayKwh != null);
  const today = todayKnown.reduce((a, l) => a + l.todayKwh, 0);
  const on = online.filter((l) => l.relayOn).length;
  sub.textContent = `${devs.length} device${devs.length === 1 ? '' : 's'} · ${on} on` + (online.length < devs.length && !connecting ? ` · ${devs.length - online.length} offline` : '');
  sum.textContent = '';
  sum.append(
    h('div', { class: 'stat' }, h('span', { class: 'k muted' }, 'Using now'), h('span', { class: 'big' }, h('span', { class: 'bolt', html: ICON.bolt }), online.length ? fmtW(watts) : '–', h('small', {}, ' W'))),
    h('div', { class: 'stat' }, h('span', { class: 'k muted' }, 'Today'), h('span', { class: 'big' }, todayKnown.length ? fmtKwh(today) : '–', h('small', {}, ' kWh')), h('span', { class: 'muted small' }, todayKnown.length ? `≈ ${money(today)}` : '')),
  );
  // banner: nothing reachable at all
  if (!connecting && online.length === 0) {
    localAddrs().then((addrs) => {
      if (live.size && store.devices.every((d) => liveOf(d.id).status === 'offline')) {
        const noWifi = native && addrs.length === 0;
        showBanner(noWifi ? "Your phone isn't on Wi-Fi. Connect to your home Wi-Fi to reach your devices." : "Can't reach your devices. Make sure your phone is on the home Wi-Fi and the plugs have power.");
      }
    });
  } else showBanner(null);
}
let addrCache = { at: 0, v: [] };
async function localAddrs() {
  if (Date.now() - addrCache.at < 8000) return addrCache.v;
  addrCache = { at: Date.now(), v: await transport.localAddresses() };
  return addrCache.v;
}
let pluginProblem = null;
function showBanner(text) {
  text = pluginProblem || text;
  const b = $('banner');
  b.hidden = !text;
  if (text) b.textContent = text;
}

// ---- Layers (detail + sheets) ----------------------------------------------------------------------
const layerStack = [];
function pushLayer(node, cls = '', onClose) {
  const layer = h('div', { class: 'layer ' + cls });
  layer.append(node);
  $('layers').append(layer);
  requestAnimationFrame(() => layer.classList.add('in'));
  const rec = { layer, onClose, closing: false };
  layerStack.push(rec);
  history.pushState({ layer: layerStack.length }, '');
  return rec;
}
// Every close goes through history.back() so the Android back button/gesture and on-screen buttons agree.
function closeLayer(rec) {
  if (rec.closing) return;
  rec.closing = true;
  if (layerStack[layerStack.length - 1] === rec) history.back();
}
addEventListener('popstate', () => {
  const rec = layerStack.pop();
  if (!rec) return;
  rec.layer.classList.remove('in');
  setTimeout(() => rec.layer.remove(), 220);
  rec.onClose && rec.onClose();
  const next = layerStack[layerStack.length - 1];
  if (next && next.closing) history.back();
});

function sheet(title, body, { onClose } = {}) {
  const close = () => closeLayer(rec);
  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-label': title },
    h('div', { class: 'grab' }),
    h('div', { class: 'sheet-head' }, h('h2', {}, title), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: close, html: '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M6 6l12 12M18 6 6 18"/></svg>' })),
    body);
  const rec = pushLayer(h('div', { class: 'sheet-wrap' }, h('div', { class: 'scrim', onclick: close }), panel), 'sheet-layer', onClose);
  return { close, panel };
}

// ---- Add device -----------------------------------------------------------------------------------
function openAddSheet() {
  const results = h('div', { class: 'results' });
  const status = h('p', { class: 'muted center' });
  const ipInput = h('input', { class: 'input', type: 'text', inputmode: 'decimal', placeholder: '192.168.1.50', autocomplete: 'off', 'aria-label': 'IP address' });
  const ipErr = h('p', { class: 'err', hidden: true });
  const connectBtn = h('button', { class: 'btn primary', type: 'button' }, 'Connect');
  const scanBtn = h('button', { class: 'btn secondary', type: 'button' }, 'Search again');
  const findPane = h('div', { class: 'pane' }, status, results, scanBtn);
  const ipPane = h('div', { class: 'pane', hidden: true },
    h('label', { class: 'field' }, h('span', {}, "Plug's IP address"), ipInput),
    ipErr, connectBtn,
    h('p', { class: 'muted small' }, 'Find it in the Kasa app (open the plug, Device settings, Device info) or in your router\'s list of connected devices. Tip: give the plug a fixed address in your router so it never changes.'));
  const tabs = h('div', { class: 'seg', role: 'tablist' });
  const tFind = h('button', { type: 'button', role: 'tab', class: 'on' }, 'Find on Wi-Fi');
  const tIp = h('button', { type: 'button', role: 'tab' }, 'Enter IP');
  tabs.append(tFind, tIp);
  const pick = (find) => { tFind.classList.toggle('on', find); tIp.classList.toggle('on', !find); findPane.hidden = !find; ipPane.hidden = find; if (!find) ipInput.focus(); };
  tFind.onclick = () => pick(true); tIp.onclick = () => pick(false);

  const sh = sheet('Add a device', h('div', {}, tabs, findPane, ipPane));

  function addDevice(host, info) {
    const existing = store.devices.find((d) => (info.mac && d.mac === info.mac) || d.host === host);
    if (existing) { existing.host = host; store.saveDevices(); toast(`${existing.name} is already added`); schedule(existing.id, 0); return existing; }
    let id = 'hs110:' + (info.deviceId || info.mac || host);
    while (store.devices.some((d) => d.id === id)) id += '+'; // never let two devices share a key
    const dev = { id, type: 'hs110', name: info.alias, host, model: info.model, hwVer: info.hwVer, swVer: info.swVer, mac: info.mac, deviceId: info.deviceId, addedAt: Date.now() };
    store.devices.push(dev);
    store.saveDevices();
    renderGrid();
    schedule(dev.id, 0);
    return dev;
  }

  let scanId = 0;
  async function scan() {
    const my = ++scanId;
    results.textContent = '';
    scanBtn.disabled = true;
    status.innerHTML = '<span class="spinner"></span> Looking for plugs on your Wi-Fi…';
    let found = [];
    try { found = await client.discover({ timeoutMs: 2500 }); } catch (e) { if (my === scanId) status.textContent = describeError(e); }
    if (my !== scanId) return;
    scanBtn.disabled = false;
    if (!found.length) {
      status.textContent = "Didn't find any plugs. Check your phone is on the home Wi-Fi, or use Enter IP.";
      return;
    }
    status.textContent = `Found ${found.length} device${found.length === 1 ? '' : 's'}`;
    for (const f of found) {
      const already = store.devices.some((d) => (f.info.mac && d.mac === f.info.mac) || d.host === f.host);
      const btn = h('button', { class: 'btn small ' + (already ? 'secondary' : 'primary'), type: 'button', disabled: already }, already ? 'Added' : 'Add');
      btn.onclick = () => { addDevice(f.host, f.info); toast(`Added ${f.info.alias}`); sh.close(); };
      results.append(h('div', { class: 'result' }, h('div', { class: 'dev-icon', html: ICON.plug }),
        h('div', { class: 'grow' }, h('div', { class: 'dev-name' }, f.info.alias), h('div', { class: 'muted small' }, `${f.info.model || 'Kasa device'} · ${f.host}`)), btn));
    }
  }
  scanBtn.onclick = scan;

  connectBtn.onclick = async () => {
    const host = ipInput.value.trim();
    ipErr.hidden = true;
    if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host.split('.').some((n) => +n > 255)) { ipErr.textContent = describeError(new KasaError('badhost')); ipErr.hidden = false; return; }
    connectBtn.disabled = true; connectBtn.textContent = 'Connecting…';
    try {
      const info = await client.sysinfo(host);
      const dev = addDevice(host, info);
      toast(`Added ${dev.name}`);
      sh.close();
    } catch (e) { ipErr.textContent = describeError(e); ipErr.hidden = false; }
    connectBtn.disabled = false; connectBtn.textContent = 'Connect';
  };
  ipInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') connectBtn.click(); });
  scan();
}

// ---- Device detail --------------------------------------------------------------------------------
function openDetail(id) {
  const dev = store.devices.find((d) => d.id === id);
  if (!dev) return;
  detailId = id;
  const L = liveOf(id);
  const d = {
    mode: 'days',
    title: h('h2', { class: 'detail-title' }),
    sub: h('p', { class: 'muted' }),
    power: h('button', { class: 'power', type: 'button', 'aria-label': 'Power', 'aria-pressed': 'false', html: ICON.power }),
    state: h('p', { class: 'state' }),
    err: h('div', { class: 'banner error', hidden: true }),
    watts: h('span', { class: 'bigw' }),
    tiles: {}, spark: h('div', { class: 'spark-host' }), chart: h('div', { class: 'chart-host' }), pick: h('p', { class: 'chart-pick muted' }, ' '),
    today: h('div', { class: 'e-val' }), todayCost: h('div', { class: 'muted small' }),
    month: h('div', { class: 'e-val' }), monthCost: h('div', { class: 'muted small' }),
    info: h('dl', { class: 'info' }),
  };
  const tile = (k, label, unit) => { d.tiles[k] = h('span', { class: 'tv' }); return h('div', { class: 'tile' }, h('span', { class: 'k muted' }, label), h('div', {}, d.tiles[k], h('small', {}, ' ' + unit))); };
  d.power.onclick = () => setPower(id, !liveOf(id).relayOn);
  const segDays = h('button', { type: 'button', class: 'on' }, 'This month');
  const segMonths = h('button', { type: 'button' }, 'This year');
  segDays.onclick = () => { d.mode = 'days'; segDays.classList.add('on'); segMonths.classList.remove('on'); d.pick.textContent = ' '; updateDetail(); };
  segMonths.onclick = () => { d.mode = 'months'; segMonths.classList.add('on'); segDays.classList.remove('on'); d.pick.textContent = ' '; refreshStats(store.devices.find((x) => x.id === id), true); updateDetail(); };

  const back = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Back', html: ICON.back });
  const page = h('div', { class: 'detail' },
    h('header', { class: 'detail-top' }, back, h('div', { class: 'grow' }, d.title, d.sub),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Device settings', onclick: () => deviceSettings(id), html: '<svg viewBox="0 0 24 24" width="22" height="22"><circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/></svg>' })),
    d.err,
    h('div', { class: 'hero' }, d.power, d.state),
    h('section', { class: 'card pad' }, h('div', { class: 'live-head' }, h('span', { class: 'k muted' }, 'Power now'), h('span', { class: 'bigw-wrap' }, d.watts, h('small', {}, ' W'))), d.spark,
      h('div', { class: 'tiles' }, tile('volts', 'Voltage', 'V'), tile('amps', 'Current', 'A'), tile('total', 'Lifetime', 'kWh'))),
    h('section', { class: 'card pad' },
      h('div', { class: 'energy' }, h('div', {}, h('span', { class: 'k muted' }, 'Today'), d.today, d.todayCost), h('div', {}, h('span', { class: 'k muted' }, 'This month'), d.month, d.monthCost)),
      h('div', { class: 'seg' }, segDays, segMonths), d.pick, d.chart),
    h('section', { class: 'card pad' }, h('h3', {}, 'Device'), d.info),
    h('p', { class: 'muted small center foot' }, 'Live readings are kept while the app is open.'));
  const rec = pushLayer(page, 'detail-layer', () => { detailId = null; detail = null; });
  detail = { d, rec };
  back.onclick = closeDetail;
  updateDetail();
  refreshStats(dev, true);
  schedule(id, 0);
}

function closeDetail() {
  if (!detail) return;
  closeLayer(detail.rec);
}

function updateDetail() {
  if (!detail) return;
  const { d } = detail;
  const dev = store.devices.find((x) => x.id === detailId);
  if (!dev) { closeDetail(); return; }
  const L = liveOf(dev.id);
  const online = L.status === 'online';
  d.title.textContent = dev.name;
  d.sub.textContent = `${DRIVERS[dev.type].label} · ${dev.host}`;
  d.power.classList.toggle('on', online && L.relayOn);
  d.power.classList.toggle('dead', !online);
  d.power.setAttribute('aria-pressed', String(online && L.relayOn));
  d.state.textContent = L.status === 'connecting' ? 'Connecting…' : !online ? 'Offline' : L.relayOn ? (L.onTimeSec ? `On for ${onFor(L.onTimeSec)}` : 'On') : 'Off';
  d.err.hidden = L.status !== 'offline';
  if (L.status === 'offline') d.err.textContent = `${describeError(L.err)} ${L.lastOk ? `(last seen ${ago(L.lastOk)}). ` : ''}Still trying every few seconds.`;
  const emeter = online && L.hasEmeter;
  d.watts.textContent = emeter ? fmtW(L.relayOn ? L.watts : 0) : '–';
  d.tiles.volts.textContent = emeter && L.volts != null ? L.volts.toFixed(1) : '–';
  d.tiles.amps.textContent = emeter && L.amps != null ? (L.relayOn ? L.amps : 0).toFixed(2) : '–';
  d.tiles.total.textContent = emeter && L.totalKwh != null ? L.totalKwh.toFixed(1) : '–';
  sparkline(d.spark, L.hist);
  d.today.textContent = L.todayKwh == null ? '–' : `${fmtKwh(L.todayKwh)} kWh`;
  d.todayCost.textContent = L.todayKwh == null ? '' : `≈ ${money(L.todayKwh)}`;
  d.month.textContent = L.monthKwh == null ? '–' : `${fmtKwh(L.monthKwh)} kWh`;
  d.monthCost.textContent = L.monthKwh == null ? '' : `≈ ${money(L.monthKwh)}`;
  drawChart(d, L);
  const rows = [['Model', [dev.model, dev.hwVer && 'hw ' + dev.hwVer].filter(Boolean).join(' · ') || '–'], ['Firmware', dev.swVer || '–'], ['IP address', dev.host], ['MAC', dev.mac || '–'], ['Wi-Fi signal', L.rssi != null ? L.rssi + ' dBm' : '–']];
  d.info.textContent = '';
  for (const [k, v] of rows) d.info.append(h('dt', {}, k), h('dd', {}, v));
}

function drawChart(d, L) {
  const key = [d.mode, L.statsAt, L.days && L.days.length, L.months && L.months.length, store.settings.price, store.settings.currency].join('|');
  if (d.chartKey === key) return;
  d.chartKey = key;
  const now = new Date();
  const price = store.settings.price, cur = store.settings.currency;
  const onSelect = (it) => { d.pick.textContent = it ? `${it.title} · ${fmtKwh(it.value)} kWh · ${cur}${(it.value * price).toFixed(2)}` : ' '; };
  if (d.mode === 'days') {
    const days = L.days || [];
    const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const byDay = new Map(days.map((x) => [x.day, x.kwh]));
    const items = [];
    for (let day = 1; day <= dim; day++) items.push({ label: String(day), value: byDay.get(day) || 0, highlight: day === now.getDate(), title: `${day} ${MONTHS[now.getMonth()]}` });
    barChart(d.chart, L.days ? items : [], { labelEvery: 5, onSelect });
  } else {
    const byM = new Map((L.months || []).map((x) => [x.month, x.kwh]));
    const items = [];
    for (let m = 1; m <= 12; m++) items.push({ label: MONTHS[m - 1][0], value: byM.get(m) || 0, highlight: m === now.getMonth() + 1, title: `${MONTHS[m - 1]} ${now.getFullYear()}` });
    barChart(d.chart, L.months ? items : [], { labelEvery: 1, onSelect });
  }
}

function deviceSettings(id) {
  const dev = store.devices.find((x) => x.id === id);
  if (!dev) return;
  const name = h('input', { class: 'input', type: 'text', value: dev.name, maxlength: '40', 'aria-label': 'Name' });
  const ip = h('input', { class: 'input', type: 'text', value: dev.host, inputmode: 'decimal', 'aria-label': 'IP address' });
  const save = h('button', { class: 'btn primary', type: 'button' }, 'Save');
  const del = h('button', { class: 'btn danger', type: 'button' }, 'Remove this device');
  const sh = sheet('Device settings', h('div', { class: 'pane' },
    h('label', { class: 'field' }, h('span', {}, 'Name (shown in this app)'), name),
    h('label', { class: 'field' }, h('span', {}, 'IP address'), ip), save, del));
  save.onclick = () => {
    dev.name = name.value.trim() || dev.name;
    const newIp = ip.value.trim();
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(newIp) && newIp !== dev.host) { dev.host = newIp; liveOf(id).status = 'connecting'; liveOf(id).fails = 0; schedule(id, 0); }
    store.saveDevices(); updateCard(id); updateDetail(); sh.close();
  };
  del.onclick = () => {
    if (del.dataset.sure !== '1') { del.dataset.sure = '1'; del.textContent = 'Tap again to remove'; return; }
    clearTimeout(timers.get(id)); timers.delete(id); live.delete(id);
    store.devices = store.devices.filter((x) => x.id !== id);
    store.saveDevices(); sh.close(); closeDetail(); renderGrid();
  };
}

// ---- Settings -------------------------------------------------------------------------------------
function openSettings() {
  const S = store.settings;
  const seg = h('div', { class: 'seg' });
  for (const [v, label] of [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']]) {
    seg.append(h('button', { type: 'button', class: S.theme === v ? 'on' : '', onclick: (e) => { S.theme = v; store.saveSettings(); applyTheme(); [...seg.children].forEach((b) => b.classList.toggle('on', b === e.target)); } }, label));
  }
  const price = h('input', { class: 'input', type: 'number', step: '0.01', min: '0', inputmode: 'decimal', value: String(S.price), 'aria-label': 'Price per kWh' });
  const cur = h('input', { class: 'input short', type: 'text', maxlength: '4', value: S.currency, 'aria-label': 'Currency symbol' });
  const apply = () => { const p = parseFloat(price.value); if (isFinite(p) && p >= 0) S.price = p; S.currency = cur.value || '$'; store.saveSettings(); store.devices.forEach((x) => updateCard(x.id)); updateSummary(); updateDetail(); };
  price.addEventListener('input', apply); cur.addEventListener('input', apply);
  const forget = h('button', { class: 'btn danger', type: 'button' }, 'Forget all devices');
  forget.onclick = () => {
    if (forget.dataset.sure !== '1') { forget.dataset.sure = '1'; forget.textContent = 'Tap again to forget all'; return; }
    store.devices.forEach((x) => clearTimeout(timers.get(x.id))); live.clear(); store.devices = []; store.saveDevices(); renderGrid(); sh.close();
  };
  const sh = sheet('Settings', h('div', { class: 'pane' },
    h('div', { class: 'field' }, h('span', {}, 'Appearance'), seg),
    h('div', { class: 'field' }, h('span', {}, 'Electricity price (per kWh, used for cost estimates)'), h('div', { class: 'inline' }, cur, price)),
    h('p', { class: 'muted small' }, 'Live readings refresh about every 2 seconds while the app is open. Everything stays on your phone: no account and no cloud.'),
    forget,
    h('p', { class: 'muted small center' }, `Smart Home ${VERSION}${demo ? ' (demo)' : ''}`)));
}

// ---- Boot -----------------------------------------------------------------------------------------
function step(name, fn) {
  try { fn(); } catch (e) { reportError('Startup step "' + name + '" failed: ' + ((e && e.stack) || e)); }
}

function boot() {
  $('btnSettings').onclick = openSettings;
  step('theme', applyTheme);
  if (!native && !demo) {
    $('notice').hidden = false;
    $('btnDemo').onclick = () => { store.settings.demo = true; store.saveSettings(); location.search = ''; location.reload(); };
    return;
  }
  $('app').hidden = false;
  if (demo) {
    $('demoBar').hidden = false;
    $('btnExitDemo').onclick = () => { store.settings.demo = false; store.saveSettings(); location.search = ''; location.reload(); };
    store.devices = DEMO_DEVICES.slice();
  } else {
    step('load devices', () => store.loadDevices());
  }
  step('dashboard', renderGrid);
  step('polling', () => pollAll());
  step('rediscovery', rediscoverLoop);
  // refresh "last seen" text
  setInterval(() => store.devices.forEach((x) => liveOf(x.id).status === 'offline' && updateCard(x.id)), 15000);
  if (native && !store.devices.length) setTimeout(() => { if (!store.devices.length && !document.querySelector('.layer')) openAddSheet(); }, 600);
  if (native) checkPlugin();
}

// Tell the user (instead of failing silently) if the native network plugin can't be reached.
function checkPlugin() {
  transport.localAddresses().then(() => {}, () => {});
  plugin.localAddresses().catch((e) => {
    pluginProblem = 'The network part of this app did not load (' + ((e && e.message) || 'unknown') + '). Switching and discovery will not work. Try reinstalling the app.';
    showBanner(null);
  });
}

  // Service worker
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }

window.__smartHome = { demoPlugs, store, live, openDetail, openAddSheet, openSettings, closeDetail, client };
boot();
