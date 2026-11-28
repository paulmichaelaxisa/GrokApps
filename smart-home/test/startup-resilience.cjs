// Startup-failure tests with Capacitor's real native-bridge.js (fake androidBridge):
//  1. the native plugin is missing/unimplemented  -> UI must still render, with an explanatory banner
//  2. a script blows up at startup               -> a visible error overlay with the message, not a blank screen
//  3. a module fails to load (404)               -> overlay names the missing file
//  4. the `window.Capacitor.registerPlugin` regression: bundler-less Capacitor has no registerPlugin
const puppeteer = require(process.env.PUPPETEER_PATH || '/workspace/dl-tools/node_modules/puppeteer-core');
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path');
const ASSETS = process.argv[2] || path.join(__dirname, '..');
const OUT = process.argv[3] || '/workspace/smart-home-shots/';
const BRIDGE_JS = fs.readFileSync(path.join(__dirname, '../../android/smart-home/node_modules/@capacitor/android/capacitor/src/main/assets/native-bridge.js'), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (n, ok, x = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : ' ' + x)); if (!ok) failed++; };
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

function serve(dir, port) {
  const s = http.createServer((req, res) => {
    let f = path.join(dir, decodeURIComponent(req.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
    fs.readFile(f, (e, d) => { if (e) { res.statusCode = 404; res.end('nf'); } else { res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream'); res.end(d); } });
  });
  return new Promise((r) => s.listen(port, () => r(s)));
}
function variant(mut) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sh-'));
  fs.cpSync(ASSETS, d, { recursive: true, filter: (p) => !/\/(test|node_modules)(\/|$)/.test(p) });
  mut(d);
  return d;
}

async function run(name, dir, port, { plugin }, fn) {
  const srv = await serve(dir, port);
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await p.exposeFunction('__toNative', async (json) => {
    const call = JSON.parse(json);
    const result = { success: false, error: { message: '"SmartNet" plugin is not implemented on android', code: 'UNIMPLEMENTED' }, callbackId: call.callbackId, pluginId: call.pluginId, methodName: call.methodName };
    await p.evaluate((r) => window.Capacitor.fromNative(r), result).catch(() => {});
  });
  const headers = plugin ? JSON.stringify([{ name: 'SmartNet', methods: ['tcpRequest', 'udpDiscover', 'tcpSweep', 'localAddresses', 'setChrome', 'prepare', 'discover'].map((n) => ({ name: n, rtype: 'promise' })) }]) : '[]';
  await p.evaluateOnNewDocument(`window.WEBVIEW_SERVER_URL = location.origin; window.androidBridge = { postMessage: (s) => window.__toNative(s) };
    (function (w) { var a = (w.Capacitor = w.Capacitor || {}); a.PluginHeaders = ${headers}; })(window);` + BRIDGE_JS);
  await p.goto(`http://localhost:${port}/`);
  console.log('--- ' + name);
  await fn(p);
  await b.close(); srv.close();
}

(async () => {
  await run('plugin missing: UI still renders', ASSETS, 8821, { plugin: false }, async (p) => {
    await sleep(1800);
    check('dashboard visible', await p.$eval('#app', (e) => !e.hidden));
    check('has the Add device card', (await p.$$('.add-card')).length === 1);
    check('banner explains the network part is missing', await p.$eval('#banner', (e) => !e.hidden && /network part/.test(e.textContent)), await p.$eval('#banner', (e) => e.textContent));
    check('no error overlay', (await p.$('[role=alert]')) === null);
    await p.screenshot({ path: OUT + '40-plugin-missing.png' });
  });
  const boom = variant((d) => fs.writeFileSync(path.join(d, 'app.mjs'), 'throw new Error("boom at startup");\n' + fs.readFileSync(path.join(d, 'app.mjs'), 'utf8')));
  await run('script throws at startup: visible overlay', boom, 8822, { plugin: true }, async (p) => {
    await sleep(1200);
    const t = await p.$eval('[role=alert]', (e) => e.textContent).catch(() => '');
    check('overlay shows the message', /boom at startup/.test(t), t.slice(0, 200));
    await p.screenshot({ path: OUT + '41-error-overlay.png' });
  });
  const missing = variant((d) => fs.rmSync(path.join(d, 'hs110.mjs')));
  await run('module 404: overlay names the file', missing, 8823, { plugin: true }, async (p) => {
    await sleep(1500);
    const t = await p.$eval('[role=alert]', (e) => e.textContent).catch(() => '');
    check('overlay appears for a missing module', /Smart Home could not start/.test(t), t.slice(0, 200));
  });
  const silent = variant((d) => fs.writeFileSync(path.join(d, 'app.mjs'), '// does nothing\n'));
  await run('script that silently does nothing: watchdog overlay', silent, 8824, { plugin: true }, async (p) => {
    await sleep(5600);
    check('watchdog overlay after 5 s', /did not finish starting/.test(await p.$eval('[role=alert]', (e) => e.textContent).catch(() => '')));
  });
  const reg = variant((d) => fs.writeFileSync(path.join(d, 'app.mjs'), fs.readFileSync(path.join(d, 'app.mjs'), 'utf8') + '\nwindow.Capacitor.registerPlugin("SmartNet");\n'));
  await run('regression check: this harness really has no registerPlugin (the 1.0.0 crash)', reg, 8825, { plugin: true }, async (p) => {
    await sleep(1200);
    check('calling registerPlugin throws and is shown', /registerPlugin is not a function/.test(await p.$eval('[role=alert]', (e) => e.textContent).catch(() => '')));
  });
  console.log(failed ? failed + ' FAILED' : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})();
