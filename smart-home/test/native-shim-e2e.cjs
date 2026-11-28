// End-to-end in desktop Chrome using Capacitor's REAL Android runtime (native-bridge.js from @capacitor/android)
// with a faked `androidBridge`: the app takes its native code path exactly as in the APK (window.Capacitor comes
// only from native-bridge.js; there is no bundled @capacitor/core), and a small Node bridge answers the SmartNet
// plugin calls with real TCP/UDP sockets against the Python mock HS110s.
// Serves a folder of web assets (default: the www/ the APK is built from; pass the APK's extracted assets/public to
// test exactly what shipped). Covers add by IP, discovery, switching, live watts, hw v1 + v2,
// new-firmware and silent-plug errors, and takes screenshots.
//   node test/native-shim-e2e.cjs <shots-dir> <assets-dir>
const puppeteer = require(process.env.PUPPETEER_PATH || '/workspace/dl-tools/node_modules/puppeteer-core');
const http = require('http'), net = require('net'), dgram = require('dgram'), { spawn } = require('child_process'), path = require('path');
const OUT = process.argv[2] || '/workspace/smart-home-shots/';
const ASSETS = process.argv[3] || path.join(__dirname, '..');
const BRIDGE_JS = require('fs').readFileSync(path.join(__dirname, '../../android/smart-home/node_modules/@capacitor/android/capacitor/src/main/assets/native-bridge.js'), 'utf8');
const APP = 'http://localhost:8811/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (n, ok, x = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : ' ' + x)); if (!ok) failed++; };

// --- Node implementation of the SmartNet plugin (same contract as SmartNetPlugin.java) ---
const b64 = (s) => Buffer.from(s, 'base64');
function tcpRequest({ host, port = 9999, data, timeoutMs = 3000 }) {
  return new Promise((resolve, reject) => {
    const s = net.connect({ host, port });
    let buf = Buffer.alloc(0), done = false;
    const fin = (err, v) => { if (done) return; done = true; clearTimeout(t); s.destroy(); err ? reject(err) : resolve(v); };
    const t = setTimeout(() => fin({ code: 'timeout', message: 'Timed out' }), timeoutMs);
    s.on('connect', () => s.write(b64(data)));
    s.on('data', (d) => { buf = Buffer.concat([buf, d]); if (buf.length >= 4 && buf.length >= 4 + buf.readUInt32BE(0)) fin(null, { data: buf.subarray(0, 4 + buf.readUInt32BE(0)).toString('base64') }); });
    s.on('error', (e) => fin({ code: e.code === 'ECONNREFUSED' ? 'refused' : /ECONNRESET|EPIPE/.test(e.code) ? 'closed' : 'io', message: e.message }));
    s.on('close', () => fin({ code: 'closed', message: 'Device closed the connection' }));
  });
}
async function udpDiscover({ data, port = 9999, timeoutMs = 3500 }) {
  return new Promise((resolve) => {
    const sock = dgram.createSocket('udp4'); const replies = [];
    sock.on('message', (m, r) => replies.push({ host: r.address, data: m.toString('base64') }));
    sock.bind(0, () => {
      sock.setBroadcast(true);
      const targets = ['127.0.0.2', '127.0.0.3', '127.0.0.4'];
      for (let i = 0; i < 3; i++) setTimeout(() => { for (const t of targets) sock.send(b64(data), port, t); }, i * 200);
      setTimeout(() => { sock.close(); resolve({ replies, diagnostics: FAKE_DIAG }); }, Math.min(timeoutMs, 900));
    });
  });
}
const FAKE_DIAG = { wifiIp: '192.168.1.23', subnet: '192.168.1.0/24', ssid: 'WiFi-D7F5', onWifi: true, wifiBound: true, multicastLock: true, udpSends: 3, udpListenMs: 3500, udpReplies: 0, hostsSwept: 0, tcpHits: 0, broadcast: ['192.168.1.255', '255.255.255.255'], permissions: { nearbyWifi: 'granted', location: 'granted', localNetwork: 'not-required (targetSdk 35)' }, errors: [] };
const methods = {
  tcpRequest,
  udpDiscover,
  async tcpSweep() { return { replies: [], diagnostics: FAKE_DIAG }; },
  async prepare() { return { ...FAKE_DIAG }; },
  async discover({ udp, tcp, timeoutMs, sweep }) {
    const u = await udpDiscover({ data: udp, timeoutMs });
    const diag = { ...FAKE_DIAG, udpReplies: u.replies.length, hostsSwept: sweep === false ? 0 : 0, tcpHits: 0 };
    return { udp: u.replies, tcp: [], diagnostics: diag };
  },
  async localAddresses() { return { addresses: ['192.168.1.23'], diagnostics: FAKE_DIAG }; },
  async setChrome() { return {}; },
};
const fs = require('fs');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const stat = http.createServer((req, res) => {
  let f = path.join(ASSETS, decodeURIComponent(req.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { res.statusCode = 404; res.end('nf'); } else { res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream'); res.end(d); } });
});
const bridge = { listen: (p, cb) => stat.listen(8811, cb), close: () => stat.close() };

(async () => {
  await new Promise((r) => bridge.listen(8812, r));
  const mocks = [['127.0.0.2', 1, 'ok', 'Office Heater'], ['127.0.0.3', 2, 'ok', 'Living Room TV'], ['127.0.0.5', 1, 'newfw', 'x'], ['127.0.0.6', 1, 'silent', 'x']].map(([host, hw, mode, alias]) =>
    spawn('python3', [path.join(__dirname, 'mock_hs110.py'), '--host', host, '--hw', String(hw), '--mode', mode, '--alias', alias], { stdio: 'ignore' }));
  await sleep(900);
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-web-security'] });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  const errors = [];
  p.on('pageerror', (e) => { errors.push(e.message); console.log('PAGE ERROR:', e.message); });
  p.on('console', (m) => { if (m.type() === 'error') console.log('page console error:', m.text()); });
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.exposeFunction('__toNative', async (json) => {
    const call = JSON.parse(json);
    let result;
    try { result = { success: true, data: await methods[call.methodName](call.options) }; }
    catch (e) { result = { success: false, error: { message: e.message, code: e.code || 'io' } }; }
    result.callbackId = call.callbackId; result.pluginId = call.pluginId; result.methodName = call.methodName;
    await p.evaluate((r) => window.Capacitor.fromNative(r), result).catch(() => {});
  });
  const HEADERS = JSON.stringify([{ name: 'SmartNet', methods: ['tcpRequest', 'udpDiscover', 'tcpSweep', 'localAddresses', 'setChrome', 'prepare', 'discover'].map((n) => ({ name: n, rtype: 'promise' })) }]);
  await p.evaluateOnNewDocument(`
    if (!sessionStorage.getItem('seen')) { sessionStorage.setItem('seen', '1'); localStorage.clear(); }
    window.WEBVIEW_SERVER_URL = location.origin;
    window.androidBridge = { postMessage: (s) => window.__toNative(s) };
    (function (w) { var a = (w.Capacitor = w.Capacitor || {}); a.PluginHeaders = ${HEADERS}; })(window);
  ` + BRIDGE_JS);
  await p.goto(APP);
  await sleep(1200);
  // first launch with no devices opens the add sheet by itself and searches
  check('first launch opens Add device and finds both mock plugs by discovery', await (async () => { await sleep(4000); const n = await p.$$eval('.result .dev-name', (e) => e.map((x) => x.textContent)); return n.includes('Office Heater') && n.includes('Living Room TV'); })());
  await p.screenshot({ path: OUT + '20-native-add-discovery-dark.png' });
  await p.evaluate(() => [...document.querySelectorAll('.result')].find((r) => /Office Heater/.test(r.textContent)).querySelector('.btn').click()); await sleep(1200);
  check('adding from discovery puts a card on the dashboard', (await p.$$('.device')).length === 1);
  // add the second by IP
  await p.click('.add-card'); await sleep(400);
  await p.evaluate(() => [...document.querySelectorAll('.seg button')].find((x) => x.textContent === 'Enter IP').click());
  await p.type('.sheet .input', '127.0.0.3');
  await p.evaluate(() => [...document.querySelectorAll('.sheet .btn.primary')].find((x) => x.textContent === 'Connect').click()); await sleep(1500);
  check('adding by IP (hw v2 plug) works', (await p.$$('.device')).length === 2);
  await sleep(2500);
  const watts = await p.$$eval('.device .watts-num', (e) => e.map((x) => +x.textContent));
  check('both hw versions show live watts (~87 W)', watts.length === 2 && watts.every((w) => w > 70 && w < 100), watts.join());
  const today = await p.$$eval('.device .mini .v', (e) => e.map((x) => x.textContent));
  check("today's and month's kWh come from the plug's stats", today.every((t) => /kWh/.test(t) && !/^–/.test(t)), today.join());
  await p.screenshot({ path: OUT + '21-native-dashboard-dark.png' });
  // switch off the first
  await p.evaluate(() => { window.__trace = []; const t0 = Date.now(); const iv = setInterval(() => { const L = [...window.__smartHome.live.values()][0]; window.__trace.push((Date.now() - t0) + ':' + L.relayOn + '/' + L.pending + '/' + Math.round(L.watts)); }, 100); setTimeout(() => clearInterval(iv), 2000); });
  await p.click('.device:nth-child(1) .switch'); await sleep(1200);
  console.log(await p.evaluate(() => window.__trace.join(' ')));
  console.log(await p.evaluate(() => JSON.stringify([...window.__smartHome.live.entries()].map(([k, L]) => [k, L.relayOn, L.status, Math.round(L.watts)])) + ' ' + JSON.stringify(window.__smartHome.store.devices.map((d) => d.id + d.name)) + ' ' + [...document.querySelectorAll('.device')].map((e) => e.className).join('|')));
  console.log('toast:', await p.$eval('#toast', (e) => e.textContent));
  const offState = [await p.$eval('.device:nth-child(1) .watts-num', (e) => e.textContent), await p.$eval('.device:nth-child(1)', (e) => e.className), await p.$eval('.device:nth-child(1) .dev-name', (e) => e.textContent)];
  check('switch turns the real (mock) relay off and watts drop to 0', offState[0] === '0' && /\boff\b/.test(offState[1]), offState.join(' | '));
  await p.click('.device:nth-child(1) .switch'); await sleep(1200);
  check('and back on', (await p.$eval('.device:nth-child(1)', (e) => e.classList.contains('on'))));
  // detail
  await p.click('.device:nth-child(2) .dev-name'); await sleep(1000);
  const volts = await p.$eval('.tiles .tile:nth-child(1) .tv', (e) => e.textContent);
  check('detail shows volts 241.3 from v2 plug', volts === '241.3', volts);
  await sleep(6000);
  await p.screenshot({ path: OUT + '22-native-detail-dark.png' });
  await p.evaluate(() => history.back()); await sleep(400);
  // error cases through the add-by-IP form
  const tryIp = async (ip) => {
    await p.click('.add-card'); await sleep(300);
    await p.evaluate(() => [...document.querySelectorAll('.seg button')].find((x) => x.textContent === 'Enter IP').click());
    await p.type('.sheet .input', ip);
    await p.evaluate(() => [...document.querySelectorAll('.sheet .btn.primary')].find((x) => x.textContent === 'Connect').click());
    await sleep(3800);
    const t = await p.$eval('.err', (e) => e.textContent);
    await p.screenshot({ path: OUT + '23-native-error-' + ip.replace(/\./g, '_') + '.png' });
    await p.evaluate(() => history.back()); await sleep(400);
    return t;
  };
  check('new-firmware style hang-up gives the firmware hint', /firmware/.test(await tryIp('127.0.0.5')));
  check('silent plug gives the Wi-Fi/power hint', /same Wi-Fi/.test(await tryIp('127.0.0.6')));
  check('nothing listening says it refuses local control', /refuses/.test(await tryIp('127.0.0.7')));
  // persistence
  await p.reload(); await sleep(1500);
  check('devices survive an app restart', (await p.$$('.device')).length === 2);
  check('no console/page errors', errors.length === 0, errors.join(' | '));
  mocks.forEach((m) => m.kill()); bridge.close(); await b.close();
  console.log(failed ? failed + ' FAILED' : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})();
