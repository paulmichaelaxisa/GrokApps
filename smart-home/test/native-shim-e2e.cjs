// End-to-end in desktop Chrome with a fake `window.Capacitor`: the app takes its *native Android code path*
// (nativeTransport -> SmartNet plugin calls), and a small Node bridge answers those calls with real TCP/UDP
// sockets against the Python mock HS110s. Covers add by IP, discovery, switching, live watts, hw v1 + v2,
// new-firmware and silent-plug errors, and takes screenshots.
//   node test/native-shim-e2e.cjs /workspace/smart-home-shots/
const puppeteer = require(process.env.PUPPETEER_PATH || '/workspace/dl-tools/node_modules/puppeteer-core');
const http = require('http'), net = require('net'), dgram = require('dgram'), { spawn } = require('child_process'), path = require('path');
const OUT = process.argv[2] || '/workspace/smart-home-shots/';
const APP = process.argv[3] || 'http://localhost:8811/';
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
const methods = {
  tcpRequest,
  async udpDiscover({ data, port = 9999, timeoutMs = 2500 }) {
    return new Promise((resolve) => {
      const sock = dgram.createSocket('udp4'); const replies = [];
      sock.on('message', (m, r) => replies.push({ host: r.address, data: m.toString('base64') }));
      sock.bind(0, () => { sock.setBroadcast(true); for (const t of ['127.0.0.2', '127.0.0.3', '127.0.0.4']) sock.send(b64(data), port, t); setTimeout(() => { sock.close(); resolve({ replies }); }, Math.min(timeoutMs, 900)); });
    });
  },
  async tcpSweep() { return { replies: [] }; },
  async localAddresses() { return { addresses: ['192.168.1.23'] }; },
  async setChrome() { return {}; },
};
const bridge = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.end(); return; }
  let body = ''; req.on('data', (d) => (body += d));
  req.on('end', async () => {
    const m = req.url.slice(1);
    try { const out = await methods[m](JSON.parse(body || '{}')); res.end(JSON.stringify({ ok: out })); }
    catch (e) { res.end(JSON.stringify({ err: { code: e.code || 'io', message: e.message } })); }
  });
});

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
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.evaluateOnNewDocument(() => {
    if (!sessionStorage.getItem('seen')) { sessionStorage.setItem('seen', '1'); localStorage.clear(); }
    window.Capacitor = {
      isNativePlatform: () => true,
      registerPlugin: () => new Proxy({}, { get: (_, method) => async (args) => {
        const r = await (await fetch('http://localhost:8812/' + method, { method: 'POST', body: JSON.stringify(args || {}) })).json();
        if (r.err) { const e = new Error(r.err.message); e.code = r.err.code; throw e; }
        return r.ok;
      } }),
    };
  });
  await p.goto(APP);
  await sleep(1200);
  // first launch with no devices opens the add sheet by itself and searches
  check('first launch opens Add device and finds both mock plugs by discovery', await (async () => { await sleep(2500); const n = await p.$$eval('.result .dev-name', (e) => e.map((x) => x.textContent)); return n.includes('Office Heater') && n.includes('Living Room TV'); })());
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
