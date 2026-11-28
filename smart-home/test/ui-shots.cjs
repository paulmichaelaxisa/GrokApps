// Headless-Chrome UI check in demo mode: drives the real UI against simulated plugs, asserts behaviour, takes screenshots.
//   (cd smart-home && python3 -m http.server 8811 &)   node test/ui-shots.cjs http://localhost:8811/ /workspace/smart-home-shots/
const puppeteer = require(process.env.PUPPETEER_PATH || '/workspace/dl-tools/node_modules/puppeteer-core');
const URL_ = process.argv[2] || 'http://localhost:8811/';
const OUT = process.argv[3] || '/workspace/smart-home-shots/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const clickConnect = () => [...document.querySelectorAll('.sheet .btn.primary')].find((b) => b.textContent === 'Connect').click();
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' ' + extra)); if (!ok) failed++; };

(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const errors = [];
  async function page(scheme, url, fresh = true) {
    const p = await b.newPage();
    await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: false });
    await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    if (fresh) await p.evaluateOnNewDocument(() => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.clear(); } });
    await p.goto(url);
    return p;
  }
  const shot = (p, n) => p.screenshot({ path: OUT + n + '.png' });

  // 1. plain web build -> needs-the-app notice
  let p = await page('light', URL_);
  await sleep(400);
  check('web build shows the Android-app notice', await p.$eval('#notice', (e) => !e.hidden) && await p.$eval('#app', (e) => e.hidden));
  await shot(p, '01-web-notice');
  await p.close();

  // 2. demo, light
  p = await page('light', URL_ + '?demo=1');
  await sleep(2600);
  const names = await p.$$eval('.device .dev-name', (els) => els.map((e) => e.textContent));
  check('four demo devices on the grid', names.length === 4, names.join());
  const w1 = await p.$eval('.device .watts-num', (e) => e.textContent);
  check('live watts shown for first card', /^\d+$/.test(w1) && +w1 > 1000, w1);
  const offlineCls = await p.$$eval('.device', (els) => els.map((e) => e.className));
  check('freezer card is offline, TV is on', /offline/.test(offlineCls[2]) && /\bon\b/.test(offlineCls[1]), offlineCls.join('|'));
  await shot(p, '02-dashboard-light');

  // live update ~2s
  const seen = new Set();
  for (let i = 0; i < 6; i++) { seen.add(await p.$eval('.device .watts-num', (e) => e.textContent)); await sleep(1100); }
  check('watts refresh on their own', seen.size >= 2, [...seen].join());

  // toggle the kettle on (4th card, off)
  const kettleOn0 = await p.$eval('.device:nth-child(4)', (e) => e.classList.contains('on'));
  await p.click('.device:nth-child(4) .switch'); await sleep(700);
  const kettleOn1 = await p.$eval('.device:nth-child(4)', (e) => e.classList.contains('on'));
  check('tapping the switch turns the plug on (simulated relay)', !kettleOn0 && kettleOn1 && (await p.evaluate(() => window.__smartHome.demoPlugs['192.168.1.44'].relay)) === 1);
  await p.click('.device:nth-child(4) .switch'); await sleep(700);
  check('and off again', (await p.evaluate(() => window.__smartHome.demoPlugs['192.168.1.44'].relay)) === 0);

  // offline toggle is refused
  await p.click('.device:nth-child(3) .switch'); await sleep(300);
  check('offline plug cannot be switched, toast explains', await p.$eval('#toast', (e) => /offline/.test(e.textContent)));

  // detail
  await p.click('.device:nth-child(1) .dev-name'); await sleep(900);
  check('detail opens with title', (await p.$eval('.detail-title', (e) => e.textContent)) === 'Office Heater');
  check('detail shows volts', /^24\d\.\d$/.test(await p.$eval('.tiles .tile:nth-child(1) .tv', (e) => e.textContent)));
  check('month chart has bars', (await p.$$eval('.chart .bar', (e) => e.length)) >= 28);
  await sleep(3500); // let the sparkline collect samples
  await p.evaluate(() => document.querySelector('.detail-layer').scrollTo(0, 0));
  await shot(p, '03-detail-light');
  await p.click('.chart .hit:nth-of-type(10)').catch(() => {});
  const bars = await p.$$('.chart .hit'); await bars[9].click(); await sleep(150);
  check('tapping a bar shows its kWh and cost', /kWh · \$/.test(await p.$eval('.chart-pick', (e) => e.textContent)), await p.$eval('.chart-pick', (e) => e.textContent));
  await p.evaluate(() => document.querySelector('.detail-layer').scrollTo(0, 400));
  await sleep(200);
  await shot(p, '04-detail-chart-light');
  const seg = await p.$$('.detail .seg button'); await seg[1].click(); await sleep(900);
  check('year chart has 12 bars', (await p.$$eval('.chart .bar', (e) => e.length)) === 12);
  await shot(p, '05-detail-year-light');
  // back via browser history (Android back button)
  await p.evaluate(() => history.back()); await sleep(500);
  check('back closes the detail', (await p.$('.detail')) === null);

  // add sheet
  await p.evaluate(() => { const pl = window.__smartHome.demoPlugs; pl['192.168.1.50'] = new (pl['192.168.1.41'].constructor)({ alias: 'Bedroom Lamp', hw: 2, baseWatts: 11 }); });
  await p.click('.add-card'); await sleep(300);
  await shot(p, '06-add-searching');
  await sleep(1800);
  check('discovery lists the new plug and marks existing ones Added', (await p.$$eval('.result .dev-name', (e) => e.map((x) => x.textContent))).includes('Bedroom Lamp'));
  await shot(p, '07-add-found-light');
  await p.evaluate(() => [...document.querySelectorAll('.seg button')].find((b) => b.textContent === 'Enter IP').click()); await sleep(200);
  await p.type('.sheet .input', '10.9.9.9'); await p.evaluate(clickConnect); await sleep(1800);
  check('manual IP that does not answer shows a friendly error', /same Wi-Fi/.test(await p.$eval('.err', (e) => e.textContent)));
  await shot(p, '08-add-ip-error-light');
  await p.$eval('.sheet .input', (e) => (e.value = '')); await p.type('.sheet .input', '192.168.1.50'); await p.evaluate(clickConnect); await sleep(1200);
  check('manual IP adds the plug and it is saved', (await p.evaluate(() => window.__smartHome.store.devices.map((d) => d.name))).includes('Bedroom Lamp'));
  await sleep(800);

  // settings: price change changes cost estimate
  await p.click('#btnSettings'); await sleep(400);
  await shot(p, '09-settings-light');
  const before = await p.$eval('.device .status', (e) => e.textContent);
  await p.$eval('.sheet input[type=number]', (e) => { e.value = '0.66'; e.dispatchEvent(new Event('input')); });
  await sleep(200);
  const after = await p.$eval('.device .status', (e) => e.textContent);
  check('cost per kWh setting changes the estimate', before !== after, before + ' -> ' + after);
  await p.evaluate(() => history.back()); await sleep(400);
  await p.close();

  // 3. dark
  p = await page('dark', URL_ + '?demo=1');
  await sleep(2600);
  await shot(p, '10-dashboard-dark');
  await p.click('.device:nth-child(2) .dev-name'); await sleep(5200);
  await shot(p, '11-detail-dark');
  await p.evaluate(() => history.back()); await sleep(400);
  // everything offline -> banner
  await p.evaluate(() => Object.values(window.__smartHome.demoPlugs).forEach((x) => (x.online = false)));
  await sleep(7500);
  check('banner explains when nothing is reachable', await p.$eval('#banner', (e) => !e.hidden && /Wi-Fi/.test(e.textContent)));
  await shot(p, '12-all-offline-dark');
  await p.click('.device:nth-child(1) .dev-name'); await sleep(700);
  await shot(p, '13-detail-offline-dark');
  await p.close();

  check('no console/page errors', errors.length === 0, errors.join(' | '));
  await b.close();
  console.log(failed ? failed + ' FAILED' : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})();
