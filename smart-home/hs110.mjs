// TP-Link Kasa / HS110 local protocol (TCP port 9999).
//
// Wire format: JSON text, scrambled with the "XOR autokey" cipher (initial key 171, each byte is XORed
// with the previous *cipher* byte), sent over TCP with a 4-byte big-endian length in front.
// (UDP discovery uses the same cipher without the length prefix.)
//
// This module is pure JS (no DOM, no Capacitor) so the very same code runs in the phone's WebView, in
// the demo simulator and in the Node tests against the mock HS110 servers.

export const PORT = 9999;
export const INITIAL_KEY = 171;

const te = new TextEncoder();
const td = new TextDecoder();

/** Encrypt a JSON string -> bytes, no length prefix (UDP form). */
export function encrypt(text) {
  const src = te.encode(text);
  const out = new Uint8Array(src.length);
  let key = INITIAL_KEY;
  for (let i = 0; i < src.length; i++) {
    key = key ^ src[i];
    out[i] = key;
  }
  return out;
}

/** Decrypt cipher bytes (no length prefix) -> string. */
export function decrypt(bytes) {
  let key = INITIAL_KEY;
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    out[i] = key ^ bytes[i];
    key = bytes[i];
  }
  return td.decode(out);
}

/** Encrypt + 4-byte big-endian length prefix (TCP form). */
export function encryptFrame(text) {
  const body = encrypt(text);
  const out = new Uint8Array(4 + body.length);
  new DataView(out.buffer).setUint32(0, body.length, false);
  out.set(body, 4);
  return out;
}

/** Decrypt a whole TCP frame (header + body). Throws KasaError('badresponse') if the length is wrong. */
export function decryptFrame(frame) {
  if (!frame || frame.length < 4) throw new KasaError('badresponse', 'Reply too short');
  const len = new DataView(frame.buffer, frame.byteOffset, frame.byteLength).getUint32(0, false);
  if (frame.length - 4 < len) throw new KasaError('badresponse', 'Reply was cut short');
  return decrypt(frame.subarray(4, 4 + len));
}

export class KasaError extends Error {
  /** code: timeout | refused | unreachable | closed | io | badhost | badresponse | device | unsupported */
  constructor(code, message, extra) {
    super(message);
    this.name = 'KasaError';
    this.code = code;
    if (extra) Object.assign(this, extra);
  }
}

// ---- Commands -------------------------------------------------------------------------------------

export const Cmd = {
  sysinfo: () => ({ system: { get_sysinfo: {} } }),
  setRelay: (on) => ({ system: { set_relay_state: { state: on ? 1 : 0 } } }),
  realtime: () => ({ emeter: { get_realtime: {} } }),
  dayStat: (year, month) => ({ emeter: { get_daystat: { year, month } } }),
  monthStat: (year) => ({ emeter: { get_monthstat: { year } } }),
  // one round trip for the 2-second poll
  poll: () => ({ system: { get_sysinfo: {} }, emeter: { get_realtime: {} } }),
};

// ---- Normalising replies (hardware v1 vs v2) ------------------------------------------------------

function num(v) {
  return typeof v === 'number' && isFinite(v) ? v : null;
}

/**
 * hw v1: power (W), voltage (V), current (A), total (kWh)
 * hw v2: power_mw, voltage_mv, current_ma, total_wh
 * Whichever is present wins; returns plain numbers in W / V / A / kWh.
 */
export function normalizeRealtime(rt) {
  if (!rt || typeof rt !== 'object') return null;
  const pick = (plain, scaled, div) => {
    const a = num(rt[plain]);
    if (a !== null) return a;
    const b = num(rt[scaled]);
    return b !== null ? b / div : null;
  };
  const watts = pick('power', 'power_mw', 1000);
  const volts = pick('voltage', 'voltage_mv', 1000);
  const amps = pick('current', 'current_ma', 1000);
  const totalKwh = pick('total', 'total_wh', 1000);
  if (watts === null && volts === null && amps === null && totalKwh === null) return null;
  return { watts, volts, amps, totalKwh };
}

export function normalizeSysinfo(si) {
  if (!si || typeof si !== 'object') return null;
  const feature = typeof si.feature === 'string' ? si.feature : '';
  const model = si.model || si.dev_name || '';
  return {
    alias: si.alias || model || 'Smart plug',
    model: model,
    hwVer: si.hw_ver != null ? String(si.hw_ver) : '',
    swVer: si.sw_ver != null ? String(si.sw_ver) : '',
    mac: si.mac || si.mic_mac || '',
    deviceId: si.deviceId || '',
    relayOn: si.relay_state === 1 || si.relay_state === true,
    onTimeSec: num(si.on_time),
    rssi: num(si.rssi),
    // HS110 has an energy meter. Prefer the ENE flag, fall back to the model name.
    hasEmeter: /ENE/.test(feature) || /HS110|KP115|HS300|KP125/i.test(model),
    ledOff: si.led_off === 1,
  };
}

/** daystat -> [{year, month, day, kwh}], accepts energy (kWh, v1) and energy_wh (v2). */
export function normalizeDayStat(ds) {
  const list = ds && Array.isArray(ds.day_list) ? ds.day_list : [];
  return list.map((e) => ({ year: e.year, month: e.month, day: e.day, kwh: energyKwh(e) })).filter((e) => e.kwh !== null);
}

/** monthstat -> [{year, month, kwh}] */
export function normalizeMonthStat(ms) {
  const list = ms && Array.isArray(ms.month_list) ? ms.month_list : [];
  return list.map((e) => ({ year: e.year, month: e.month, kwh: energyKwh(e) })).filter((e) => e.kwh !== null);
}

function energyKwh(e) {
  const a = num(e.energy);
  if (a !== null) return a;
  const b = num(e.energy_wh);
  return b !== null ? b / 1000 : null;
}

// ---- Client ---------------------------------------------------------------------------------------
//
// transport.request(host, port, frameBytes, timeoutMs) -> Promise<Uint8Array frame>   (rejects KasaError)
// transport.broadcast(payloadBytes, port, timeoutMs)   -> Promise<[{host, data}]>      (UDP discovery)
// transport.sweep(frameBytes, port, timeoutMs, hosts?)  -> Promise<[{host, data}]>      (TCP /24 sweep)

export class Hs110Client {
  constructor(transport, opts = {}) {
    this.t = transport;
    this.timeoutMs = opts.timeoutMs || 3000;
  }

  /** Send a command object, return the parsed JSON reply. */
  async call(host, cmd, timeoutMs) {
    const frame = await this.t.request(host, PORT, encryptFrame(JSON.stringify(cmd)), timeoutMs || this.timeoutMs);
    let text;
    try {
      text = decryptFrame(frame);
    } catch (e) {
      if (e instanceof KasaError) throw e;
      throw new KasaError('badresponse', 'Could not read reply');
    }
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new KasaError('badresponse', "The device's reply wasn't understood");
    }
  }

  async sysinfo(host) {
    const r = await this.call(host, Cmd.sysinfo());
    return sysinfoFrom(r);
  }

  /** sysinfo + live energy in one round trip: { info, rt|null } */
  async poll(host) {
    const r = await this.call(host, Cmd.poll(), 2500);
    const info = sysinfoFrom(r);
    const em = r.emeter && r.emeter.get_realtime;
    let rt = null;
    if (em && !(em.err_code)) rt = normalizeRealtime(em);
    return { info, rt };
  }

  async setRelay(host, on) {
    const r = await this.call(host, Cmd.setRelay(on));
    const res = r.system && r.system.set_relay_state;
    if (!res) throw new KasaError('device', 'The plug did not answer the switch command');
    if (res.err_code) throw new KasaError('device', 'The plug refused the switch command (' + res.err_code + ')');
    return true;
  }

  async realtime(host) {
    const r = await this.call(host, Cmd.realtime());
    const em = r.emeter && r.emeter.get_realtime;
    if (!em || em.err_code) throw new KasaError('unsupported', 'This device has no energy meter');
    return normalizeRealtime(em);
  }

  async dayStats(host, year, month) {
    const r = await this.call(host, Cmd.dayStat(year, month));
    const ds = r.emeter && r.emeter.get_daystat;
    if (!ds || ds.err_code) throw new KasaError('unsupported', 'No daily energy history on this device');
    return normalizeDayStat(ds);
  }

  async monthStats(host, year) {
    const r = await this.call(host, Cmd.monthStat(year));
    const ms = r.emeter && r.emeter.get_monthstat;
    if (!ms || ms.err_code) throw new KasaError('unsupported', 'No monthly energy history on this device');
    return normalizeMonthStat(ms);
  }

  /**
   * Find Kasa devices on the LAN: UDP broadcast first, then (unless disabled) a TCP sweep of the
   * phone's subnet in case the router filters broadcasts. Returns [{host, info}] de-duplicated by host.
   */
  async discover({ timeoutMs = 2500, sweep = true, hosts } = {}) {
    const found = new Map();
    const take = (replies, framed) => {
      for (const r of replies || []) {
        if (found.has(r.host)) continue;
        try {
          const text = framed ? decryptFrame(r.data) : decrypt(r.data);
          const info = sysinfoFrom(JSON.parse(text));
          if (info) found.set(r.host, { host: r.host, info });
        } catch (e) { /* not a Kasa device */ }
      }
    };
    const udp = this.t.broadcast
      ? this.t.broadcast(encrypt(JSON.stringify(Cmd.sysinfo())), PORT, timeoutMs).then((r) => take(r, false), () => {})
      : Promise.resolve();
    const tcp = sweep && this.t.sweep
      ? this.t.sweep(encryptFrame(JSON.stringify(Cmd.sysinfo())), PORT, 700, hosts).then((r) => take(r, true), () => {})
      : Promise.resolve();
    await Promise.all([udp, tcp]);
    return [...found.values()];
  }
}

function sysinfoFrom(r) {
  const si = r && r.system && r.system.get_sysinfo;
  if (!si) throw new KasaError('badresponse', "That device didn't answer like a Kasa plug");
  if (si.err_code) throw new KasaError('device', 'The device reported error ' + si.err_code);
  return normalizeSysinfo(si);
}

/** Friendly sentence for any error, used by the UI. */
export function describeError(e) {
  const c = e && e.code;
  switch (c) {
    case 'timeout': return "The plug didn't answer. Check it has power and your phone is on the same Wi-Fi.";
    case 'unreachable': return "Can't reach the plug. Is your phone on the home Wi-Fi?";
    case 'refused': return 'The plug is there but refuses local control. Its firmware may be too new for this app.';
    case 'closed': return 'The plug hung up on us. Its firmware may be too new for local control.';
    case 'badhost': return "That doesn't look like an IP address.";
    case 'badresponse': return "That device didn't answer like a Kasa plug.";
    case 'device': return (e && e.message) || 'The plug reported an error.';
    case 'unsupported': return (e && e.message) || 'Not supported by this device.';
    case 'native': return 'This needs the Android app.';
    default: return (e && e.message) || 'Something went wrong talking to the plug.';
  }
}
