// Protocol tests: cipher vectors, then the client against the Python mock HS110 servers (hw v1 + v2).
// Run:  node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import {
  encrypt, decrypt, encryptFrame, decryptFrame, Hs110Client, normalizeRealtime, normalizeDayStat, normalizeMonthStat,
  Cmd, KasaError,
} from '../hs110.mjs';
import { nodeTransport } from './node-transport.mjs';
import { SimPlug, simTransport } from '../sim.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const hex = (u8) => Buffer.from(u8).toString('hex');

// 127.0.0.2 hw1, .3 hw2, .4 dribble (hw1, tiny TCP chunks), .5 new firmware (hangs up), .6 silent, .7 nothing listening
const MOCKS = [
  ['127.0.0.2', 1, 'ok'], ['127.0.0.3', 2, 'ok'], ['127.0.0.4', 1, 'dribble'], ['127.0.0.5', 1, 'newfw'], ['127.0.0.6', 1, 'silent'],
];
const LOG = path.join(os.tmpdir(), 'mock-hs110-requests.jsonl');
fs.rmSync(LOG, { force: true });
const procs = [];
test.before(async () => {
  for (const [host, hw, mode] of MOCKS) {
    const p = spawn('python3', [path.join(here, 'mock_hs110.py'), '--host', host, '--hw', String(hw), '--mode', mode, '--alias', `Mock ${host}`, ...(host === '127.0.0.2' ? ['--log', LOG] : [])], { stdio: ['ignore', 'pipe', 'inherit'] });
    procs.push(p);
    await new Promise((res) => p.stdout.once('data', res));
  }
});
test.after(() => procs.forEach((p) => p.kill()));

const client = () => new Hs110Client(nodeTransport({ udpTargets: ['127.0.0.2', '127.0.0.3', '127.0.0.4', '127.0.0.5'] }), { timeoutMs: 1500 });

test('cipher matches the published get_sysinfo vector', () => {
  const frame = encryptFrame('{"system":{"get_sysinfo":{}}}');
  assert.equal(hex(frame), '0000001dd0f281f88bff9af7d5ef94b6d1b4c09fec95e68fe187e8caf08bf68bf6');
  assert.equal(decryptFrame(frame), '{"system":{"get_sysinfo":{}}}');
});

test('cipher round trips unicode and the autokey is on the cipher byte', () => {
  const s = '{"alias":"Kitchen kettle ⚡ café"}';
  assert.equal(decrypt(encrypt(s)), s);
  assert.equal(encrypt('A')[0], 171 ^ 65);
  const c = encrypt('AB');
  assert.equal(c[1], c[0] ^ 66);
  assert.throws(() => decryptFrame(new Uint8Array([0, 0, 0, 9, 1, 2])), KasaError);
});

test('normalizers handle v1 and v2 field names', () => {
  assert.deepEqual(normalizeRealtime({ power: 12.5, voltage: 240.1, current: 0.052, total: 3.2 }), { watts: 12.5, volts: 240.1, amps: 0.052, totalKwh: 3.2 });
  assert.deepEqual(normalizeRealtime({ power_mw: 12500, voltage_mv: 240100, current_ma: 52, total_wh: 3200 }), { watts: 12.5, volts: 240.1, amps: 0.052, totalKwh: 3.2 });
  assert.equal(normalizeRealtime({ err_code: -1 }), null);
  assert.deepEqual(normalizeDayStat({ day_list: [{ year: 2026, month: 11, day: 3, energy: 1.5 }, { year: 2026, month: 11, day: 4, energy_wh: 2250 }] }).map((d) => d.kwh), [1.5, 2.25]);
  assert.deepEqual(normalizeMonthStat({ month_list: [{ year: 2026, month: 1, energy_wh: 18000 }] }), [{ year: 2026, month: 1, kwh: 18 }]);
});

for (const [host, hw] of [['127.0.0.2', 1], ['127.0.0.3', 2]]) {
  test(`hw v${hw} mock: sysinfo, switch, realtime, stats`, async () => {
    const c = client();
    const info = await c.sysinfo(host);
    assert.equal(info.alias, `Mock ${host}`);
    assert.equal(info.hwVer, hw === 1 ? '1.0' : '2.0');
    assert.equal(info.hasEmeter, true);
    assert.equal(info.relayOn, true);

    await c.setRelay(host, false);
    assert.equal((await c.sysinfo(host)).relayOn, false);
    const off = await c.realtime(host);
    assert.equal(off.watts, 0);
    await c.setRelay(host, true);
    assert.equal((await c.sysinfo(host)).relayOn, true);

    const rt = await c.realtime(host);
    assert.ok(rt.watts > 70 && rt.watts < 100, 'watts ' + rt.watts);
    assert.ok(Math.abs(rt.volts - 241.3) < 0.01);
    assert.ok(Math.abs(rt.amps - rt.watts / 241.3) < 0.01);
    assert.ok(Math.abs(rt.totalKwh - 12.345) < 0.001);

    const p = await c.poll(host);
    assert.equal(p.info.relayOn, true);
    assert.ok(p.rt.watts > 70);

    const now = new Date();
    const days = await c.dayStats(host, now.getFullYear(), now.getMonth() + 1);
    assert.equal(days.length, now.getDate());
    assert.equal(days.at(-1).day, now.getDate());
    assert.ok(days.every((d) => d.kwh > 0));
    const months = await c.monthStats(host, now.getFullYear());
    assert.equal(months.length, now.getMonth() + 1);
    assert.ok(months[0].kwh > 15);
  });
}

test('both hardware versions give the same normalised numbers', async () => {
  const c = client();
  const a = await c.realtime('127.0.0.2'), b = await c.realtime('127.0.0.3');
  assert.ok(Math.abs(a.volts - b.volts) < 0.01);
  assert.ok(Math.abs(a.totalKwh - b.totalKwh) < 0.001);
  const now = new Date();
  const da = await c.dayStats('127.0.0.2', now.getFullYear(), 3), db = await c.dayStats('127.0.0.3', now.getFullYear(), 3);
  assert.deepEqual(da.map((d) => d.kwh), db.map((d) => d.kwh));
});

test('replies that arrive in tiny TCP chunks are reassembled', async () => {
  const info = await client().sysinfo('127.0.0.4');
  assert.equal(info.alias, 'Mock 127.0.0.4');
});

test('the requests on the wire are exactly the documented JSON', async () => {
  const c = client();
  const now = new Date();
  fs.writeFileSync(LOG, '');
  await c.setRelay('127.0.0.2', false);
  await c.setRelay('127.0.0.2', true);
  await c.realtime('127.0.0.2');
  await c.dayStats('127.0.0.2', 2026, 11);
  await c.monthStats('127.0.0.2', 2026);
  await c.poll('127.0.0.2');
  const lines = fs.readFileSync(LOG, 'utf8').trim().split('\n');
  assert.deepEqual(lines, [
    '{"system":{"set_relay_state":{"state":0}}}',
    '{"system":{"set_relay_state":{"state":1}}}',
    '{"emeter":{"get_realtime":{}}}',
    '{"emeter":{"get_daystat":{"year":2026,"month":11}}}',
    '{"emeter":{"get_monthstat":{"year":2026}}}',
    '{"system":{"get_sysinfo":{}},"emeter":{"get_realtime":{}}}',
  ]);
});

test('errors: hang-up (new firmware), silence, nothing listening', async () => {
  const c = client();
  await assert.rejects(() => c.sysinfo('127.0.0.5'), (e) => e.code === 'closed');
  await assert.rejects(() => new Hs110Client(nodeTransport(), { timeoutMs: 600 }).sysinfo('127.0.0.6'), (e) => e.code === 'timeout');
  await assert.rejects(() => c.sysinfo('127.0.0.7'), (e) => e.code === 'refused');
});

test('discovery: UDP broadcast finds both versions, ignores the ones that do not talk', async () => {
  const { devices: found, diagnostics } = await client().discover({ timeoutMs: 800, sweep: false });
  const hosts = found.map((f) => f.host).sort();
  assert.ok(hosts.includes('127.0.0.2') && hosts.includes('127.0.0.3') && hosts.includes('127.0.0.4'), hosts.join());
  assert.equal(found.find((f) => f.host === '127.0.0.3').info.hwVer, '2.0');
  assert.equal(typeof diagnostics, 'object');
});

test('discovery: TCP sweep fallback finds plugs when broadcast is filtered', async () => {
  const t = nodeTransport({ udpTargets: [], sweepHosts: ['127.0.0.2', '127.0.0.3', '127.0.0.5', '127.0.0.7'] });
  const { devices: found } = await new Hs110Client(t).discover({ timeoutMs: 300 });
  assert.deepEqual(found.map((f) => f.host).sort(), ['127.0.0.2', '127.0.0.3']);
});

test('in-app simulator speaks the same protocol (demo mode)', async () => {
  const sim = simTransport({ '10.0.0.1': new SimPlug({ alias: 'Sim v1', hw: 1 }), '10.0.0.2': new SimPlug({ alias: 'Sim v2', hw: 2, relay: 0 }) }, { latencyMs: 1 });
  const c = new Hs110Client(sim);
  const a = await c.poll('10.0.0.1'), b = await c.poll('10.0.0.2');
  assert.equal(a.info.alias, 'Sim v1'); assert.ok(a.rt.watts > 50);
  assert.equal(b.info.relayOn, false); assert.equal(b.rt.watts, 0);
  await c.setRelay('10.0.0.2', true);
  assert.equal((await c.poll('10.0.0.2')).info.relayOn, true);
  const d = await c.discover({ timeoutMs: 100 });
  assert.equal(d.devices.length, 2);
});
