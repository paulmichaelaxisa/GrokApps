// Transports for the Kasa client: the real Android one (native SmartNet plugin), and helpers.
import { KasaError } from './hs110.mjs';

export function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromB64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function isNativeAndroid() {
  const c = typeof window !== 'undefined' && window.Capacitor;
  return !!(c && typeof c.isNativePlatform === 'function' && c.isNativePlatform());
}

/**
 * Handle to a native Capacitor plugin. This app has no bundler, so window.Capacitor is only what Android's
 * native-bridge.js provides: it has nativePromise(plugin, method, args) but NO registerPlugin (that lives in
 * @capacitor/core, which isn't bundled). Never throws: a missing plugin just makes each call reject.
 */
export function capacitorPlugin(name) {
  const call = (method, args) => {
    const C = window.Capacitor;
    if (C && typeof C.nativePromise === 'function') return C.nativePromise(name, method, args || {});
    const P = C && C.Plugins && C.Plugins[name];
    if (P && typeof P[method] === 'function') return P[method](args || {});
    if (C && typeof C.registerPlugin === 'function') return C.registerPlugin(name)[method](args || {});
    return Promise.reject(Object.assign(new Error('The native network plugin is not available'), { code: 'native' }));
  };
  return new Proxy({}, { get: (_, method) => (typeof method === 'string' && method !== 'then' ? (args) => call(method, args) : undefined) });
}

/** Raw TCP/UDP through the SmartNet Capacitor plugin (Android only). */
export function nativeTransport(plugin) {
  const wrap = (e) => new KasaError(e && e.code ? String(e.code).toLowerCase() === 'unimplemented' ? 'native' : e.code : 'io', (e && e.message) || 'Network error');
  return {
    kind: 'native',
    async request(host, port, frame, timeoutMs) {
      try {
        const r = await plugin.tcpRequest({ host, port, data: toB64(frame), timeoutMs });
        return fromB64(r.data);
      } catch (e) { throw wrap(e); }
    },
    async broadcast(payload, port, timeoutMs) {
      const r = await plugin.udpDiscover({ data: toB64(payload), port, timeoutMs });
      return (r.replies || []).map((x) => ({ host: x.host, data: fromB64(x.data) }));
    },
    async sweep(frame, port, timeoutMs, hosts) {
      const args = { data: toB64(frame), port, timeoutMs };
      if (hosts) args.hosts = hosts;
      const r = await plugin.tcpSweep(args);
      return (r.replies || []).map((x) => ({ host: x.host, data: fromB64(x.data) }));
    },
    async localAddresses() {
      try { return (await plugin.localAddresses()).addresses || []; } catch (e) { return []; }
    },
  };
}

/** Used on the plain web build, where raw sockets are impossible. */
export function unavailableTransport() {
  const fail = () => Promise.reject(new KasaError('native', 'This needs the Android app.'));
  return { kind: 'none', request: fail, broadcast: fail, sweep: fail, localAddresses: async () => [] };
}
