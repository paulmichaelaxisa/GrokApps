// Small localStorage-backed store for devices + settings. Demo mode uses separate keys.
const DEFAULT_SETTINGS = { theme: 'auto', price: 0.33, currency: '$', demo: false };

export function createStore(storage = globalThis.localStorage) {
  const read = (k, fallback) => {
    try { const v = JSON.parse(storage.getItem(k)); return v == null ? fallback : v; } catch (e) { return fallback; }
  };
  const write = (k, v) => { try { storage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage full or blocked */ } };
  const s = {
    settings: { ...DEFAULT_SETTINGS, ...read('smarthome.settings.v1', {}) },
    devices: [],
    saveSettings() { write('smarthome.settings.v1', s.settings); },
    saveDevices() { write(s.settings.demo ? 'smarthome.demo.devices.v1' : 'smarthome.devices.v1', s.devices); },
    loadDevices() { s.devices = read(s.settings.demo ? 'smarthome.demo.devices.v1' : 'smarthome.devices.v1', []); return s.devices; },
  };
  return s;
}
