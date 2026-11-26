// Liam's saved sound clips: IndexedDB storage on this phone, plus sharing (Android share sheet) so a
// grown-up can send them to OneDrive. Nothing is uploaded by the app itself.
import { encodeWav, OUT_RATE } from "./recring.mjs?v=1";

const DB = "sleepy-kitten-clips", STORE = "clips";
let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "name" }).createIndex("created", "created");
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return dbp;
}
const tx = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => {
  const t = d.transaction(STORE, mode), s = t.objectStore(STORE); let out; const r = fn(s);
  if (r) r.onsuccess = () => (out = r.result); t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
}); };

const pad = (n) => String(n).padStart(2, "0");
export function clipName(date, tab) {
  const d = date;
  return `liam_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}_${tab}.wav`;
}
export const localDay = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

/** Save one clip. pcm = Float32Array at 16 kHz. Returns the stored record (without the blob). */
export async function saveClip(pcm, { startedAt, tab }) {
  const bytes = encodeWav(pcm, OUT_RATE);
  let name = clipName(new Date(startedAt), tab);
  for (let i = 2; await tx("readonly", (s) => s.getKey(name)) !== undefined; i++) name = clipName(new Date(startedAt), tab).replace(/\.wav$/, `_${i}.wav`);
  const rec = { name, created: startedAt, tab, dur: pcm.length / OUT_RATE, size: bytes.byteLength, blob: new Blob([bytes], { type: "audio/wav" }) };
  await tx("readwrite", (s) => s.put(rec));
  return rec;
}
export const listClips = async () => ((await tx("readonly", (s) => s.getAll())) || []).sort((a, b) => b.created - a.created);
export const getClip = (name) => tx("readonly", (s) => s.get(name));
export const deleteClip = (name) => tx("readwrite", (s) => s.delete(name));
export const deleteAll = () => tx("readwrite", (s) => s.clear());

// ---------- zip (stored, no compression: WAV barely compresses) ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (u8) => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export async function makeZip(clips) {
  const parts = [], central = []; let off = 0;
  for (const c of clips) {
    const data = new Uint8Array(await c.blob.arrayBuffer()), name = new TextEncoder().encode(c.name), crc = crc32(data);
    const d = new Date(c.created), dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)), dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate());
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(10, dt, true); h.setUint16(12, dd, true);
    h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(12, dt, true); ch.setUint16(14, dd, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
    parts.push(h.buffer, name, data); central.push(ch.buffer, name);
    off += 30 + name.length + data.length;
  }
  const csize = central.reduce((a, b) => a + b.byteLength, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, clips.length, true); e.setUint16(10, clips.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...central, e.buffer], { type: "application/zip" });
}

// ---------- sharing ----------
const cap = () => window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() ? window.Capacitor : null;
const b64 = async (blob) => { const u8 = new Uint8Array(await blob.arrayBuffer()); let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
export const WEB_SHARE_MAX = 10; // Chrome on Android shares at most 10 files at once

/**
 * Share clips to the Android share sheet (pick OneDrive there). In the Android app this goes through
 * the native share sheet with every clip as its own .wav, any number at once. On the web (Chrome) the
 * Web Share API takes at most 10 files and no .zip, so larger sets go in batches of 10: each tap
 * shares the next batch. Last resort (no file sharing at all): download a .zip.
 * Returns { result: "shared" | "cancelled" | "downloaded", shared, total, more }.
 */
const batches = new Map(); // label -> how many already shared this visit (web only)
export async function shareClips(clips, label) {
  const total = clips.length;
  if (!total) return { result: "cancelled", shared: 0, total, more: false };
  const C = cap();
  if (C) {
    const uris = [];
    await C.nativePromise("Filesystem", "rmdir", { path: "liam-sounds", directory: "CACHE", recursive: true }).catch(() => {});
    for (const c of clips) {
      const r = await C.nativePromise("Filesystem", "writeFile", { path: `liam-sounds/${c.name}`, data: await b64(c.blob), directory: "CACHE", recursive: true });
      uris.push(r.uri);
    }
    try { await C.nativePromise("Share", "share", { title: `Liam's sounds (${label})`, files: uris, dialogTitle: "Save Liam's sounds to…" }); return { result: "shared", shared: total, total, more: false }; }
    catch (e) { if (/cancel/i.test(String(e && (e.message || e)))) return { result: "cancelled", shared: 0, total, more: false }; throw e; }
  }
  let from = batches.get(label) || 0; if (from >= total) from = 0;
  const batch = clips.slice(from, from + WEB_SHARE_MAX);
  const files = batch.map((c) => new File([c.blob], c.name, { type: "audio/wav" }));
  if (navigator.canShare && navigator.canShare({ files })) {
    try {
      await navigator.share({ files, title: `Liam's sounds (${label})` });
      const done = from + batch.length; batches.set(label, done);
      return { result: "shared", shared: batch.length, from, total, more: done < total };
    } catch (e) { if (e && e.name === "AbortError") return { result: "cancelled", shared: 0, total, more: false }; }
  }
  const zip = await makeZip(clips), name = `liam_sounds_${label.replace(/\W+/g, "-")}.zip`;
  const a = document.createElement("a"); a.href = URL.createObjectURL(zip); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  return { result: "downloaded", shared: total, total, more: false };
}
