// In-app simulator of HS110 plugs. It speaks the *real* wire protocol (encrypted frames) so demo mode
// exercises exactly the same client code as a real plug. Used for demo mode (web build + screenshots)
// and for fast offline tests.
import { encrypt, decrypt, encryptFrame, decryptFrame, KasaError } from './hs110.mjs';

let simCount = 0;
export class SimPlug {
  /** hw: 1 -> power/voltage/current/total in kWh; 2 -> *_mw/_mv/_ma/_wh */
  constructor({ alias = 'Plug', hw = 1, relay = 1, baseWatts = 80, swing = 6, online = true, totalWh = 12345 } = {}) {
    Object.assign(this, { alias, hw, relay, baseWatts, swing, online });
    this.t0 = Date.now();
    this.totalWh = totalWh;
    this.seed = Math.random() * 10;
    this.n = ++simCount;
  }
  watts() {
    if (!this.relay) return 0;
    const t = (Date.now() - this.t0) / 1000 + this.seed;
    return Math.max(0.5, this.baseWatts + this.swing * Math.sin(t / 2.7) + (this.swing / 3) * Math.sin(t * 1.9));
  }
  sysinfo() {
    return {
      sw_ver: this.hw === 1 ? '1.2.5 Build 171206 Rel.085954' : '1.5.10 Build 191125 Rel.143500',
      hw_ver: this.hw === 1 ? '1.0' : '2.0', model: 'HS110(AU)',
      deviceId: 'SIM' + this.n + this.alias.replace(/\W/g, '').toUpperCase().padEnd(36, '0'),
      alias: this.alias, mac: (this.hw === 1 ? '50:C7:BF:12:34:' : 'B0:95:75:AB:CD:') + (this.n + 16).toString(16).toUpperCase().padStart(2, '0'),
      relay_state: this.relay, on_time: this.relay ? Math.floor((Date.now() - this.t0) / 1000) + 5400 : 0,
      feature: 'TIM:ENE', rssi: -52, led_off: 0, err_code: 0,
    };
  }
  realtime() {
    const w = this.watts(), v = 241.3, a = w / v;
    return this.hw === 1
      ? { power: +w.toFixed(3), voltage: v, current: +a.toFixed(4), total: +(this.totalWh / 1000).toFixed(3), err_code: 0 }
      : { power_mw: Math.round(w * 1000), voltage_mv: Math.round(v * 1000), current_ma: Math.round(a * 1000), total_wh: Math.round(this.totalWh), err_code: 0 };
  }
  energy(base, kwh) {
    return this.hw === 1 ? { ...base, energy: kwh } : { ...base, energy_wh: Math.round(kwh * 1000) };
  }
  daystat(year, month) {
    const now = new Date();
    const cur = year === now.getFullYear() && month === now.getMonth() + 1;
    const last = cur ? now.getDate() : new Date(year, month, 0).getDate();
    const scale = this.baseWatts / 80;
    const list = [];
    for (let d = 1; d <= last; d++) {
      const kwh = cur && d === last ? 0.2 * scale * (now.getHours() + 1) / 3 : scale * (0.9 + ((d * 37) % 13) / 9);
      list.push(this.energy({ year, month, day: d }, +kwh.toFixed(3)));
    }
    return { day_list: list, err_code: 0 };
  }
  monthstat(year) {
    const now = new Date();
    const last = year === now.getFullYear() ? now.getMonth() + 1 : 12;
    const scale = this.baseWatts / 80;
    const list = [];
    for (let m = 1; m <= last; m++) list.push(this.energy({ year, month: m }, +(scale * (20 + ((m * 53) % 17))).toFixed(2)));
    return { month_list: list, err_code: 0 };
  }
  handle(req) {
    const out = {};
    for (const [mod, cmds] of Object.entries(req)) {
      out[mod] = {};
      for (const [cmd, arg] of Object.entries(cmds || {})) out[mod][cmd] = this.run(mod, cmd, arg || {});
    }
    return out;
  }
  run(mod, cmd, a) {
    const k = mod + '.' + cmd;
    if (k === 'system.get_sysinfo') return this.sysinfo();
    if (k === 'system.set_relay_state') { this.relay = a.state ? 1 : 0; return { err_code: 0 }; }
    if (k === 'emeter.get_realtime') return this.realtime();
    if (k === 'emeter.get_daystat') return this.daystat(a.year, a.month);
    if (k === 'emeter.get_monthstat') return this.monthstat(a.year);
    return { err_code: -2, err_msg: 'member not support' };
  }
}

/** Transport over a set of simulated plugs keyed by IP. Unknown or offline hosts time out / are unreachable. */
export function simTransport(plugs, { latencyMs = 60 } = {}) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  return {
    kind: 'sim',
    plugs,
    async request(host, port, frame, timeoutMs) {
      await sleep(latencyMs);
      const p = plugs[host];
      if (!p) { await sleep(Math.min(timeoutMs, 800)); throw new KasaError('timeout', 'Timed out'); }
      if (!p.online) throw new KasaError(p.failure || 'timeout', 'Device offline');
      const req = JSON.parse(decryptFrame(frame));
      return encryptFrame(JSON.stringify(p.handle(req)));
    },
    async broadcast(payload) {
      await sleep(900);
      const req = JSON.parse(decrypt(payload));
      return Object.entries(plugs).filter(([, p]) => p.online && !p.hidden).map(([host, p]) => ({ host, data: encrypt(JSON.stringify(p.handle(req))) }));
    },
    async sweep() { await sleep(600); return []; },
    async localAddresses() { return ['192.168.1.23']; },
  };
}
