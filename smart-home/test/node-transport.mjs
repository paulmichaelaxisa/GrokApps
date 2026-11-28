// Node transport for tests: same interface as the Android plugin transport, over node:net / node:dgram.
import net from 'node:net';
import dgram from 'node:dgram';
import { KasaError } from '../hs110.mjs';

export function nodeTransport({ udpTargets = ['255.255.255.255'], sweepHosts = [] } = {}) {
  const request = (host, port, frame, timeoutMs) => new Promise((resolve, reject) => {
    const s = net.connect({ host, port });
    let buf = Buffer.alloc(0);
    let done = false;
    const finish = (err, val) => { if (done) return; done = true; clearTimeout(timer); s.destroy(); err ? reject(err) : resolve(val); };
    const timer = setTimeout(() => finish(new KasaError('timeout', 'Timed out')), timeoutMs);
    s.on('connect', () => s.write(frame));
    s.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      if (buf.length >= 4 && buf.length >= 4 + buf.readUInt32BE(0)) finish(null, new Uint8Array(buf.subarray(0, 4 + buf.readUInt32BE(0))));
    });
    s.on('error', (e) => finish(new KasaError(e.code === 'ECONNREFUSED' ? 'refused' : /ECONNRESET|EPIPE/.test(e.code) ? 'closed' : /UNREACH/.test(e.code) ? 'unreachable' : 'io', e.message)));
    s.on('close', () => finish(new KasaError('closed', 'Device closed the connection')));
  });
  const broadcast = (payload, port, timeoutMs) => new Promise((resolve) => {
    const sock = dgram.createSocket('udp4');
    const out = [];
    sock.on('message', (m, r) => out.push({ host: r.address, data: new Uint8Array(m) }));
    sock.bind(0, () => {
      sock.setBroadcast(true);
      for (const t of udpTargets) sock.send(payload, port, t, () => {});
      setTimeout(() => { sock.close(); resolve(out); }, timeoutMs);
    });
  });
  const sweep = async (frame, port, timeoutMs, hosts) => {
    const out = [];
    await Promise.all((hosts || sweepHosts).map((h) => request(h, port, frame, timeoutMs).then((d) => out.push({ host: h, data: d }), () => {})));
    return out;
  };
  return { kind: 'node', request, broadcast, sweep, localAddresses: async () => [] };
}
