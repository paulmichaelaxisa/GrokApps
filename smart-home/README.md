# Smart Home (Phase 1: TP-Link HS110 plug)

A custom smart-home dashboard for Paul. Phase 1 controls a **TP-Link Kasa HS110** smart plug directly from
the phone over the home Wi-Fi: **no hub and no cloud**, nothing leaves the phone.

- **Android app (the real thing):** `com.paulaxisa.smarthome`, see [`../android/smart-home/`](../android/smart-home/).
  A web page can't open raw TCP/UDP sockets, so a tiny native Capacitor plugin (`SmartNet`) does the sockets.
- **Web build (this folder):** shows a "needs the Android app" notice, with a **Try the demo** button that runs the
  same UI against simulated plugs (`sim.mjs`). Open it with `?demo=1` to skip the notice.

## What it does
- Device grid built to grow (plug is card #1; add more device types in `DRIVERS` in `app.mjs`).
- Big on/off toggle, live watts about every 2 s, volts, amps, lifetime kWh, last-3-minute power graph.
- Today's and this month's kWh (and estimated cost) plus a bar chart of the plug's daily and monthly stats.
- Add a plug by **auto-discovery** (UDP broadcast, plus a TCP sweep of the phone's /24 as a fallback) or by **IP**.
  Devices are saved on the phone. If a plug's IP changes (DHCP), the app finds it again by MAC address.
- Light/dark/auto theme, electricity price per kWh (default 0.33, currency symbol `$`).
- Offline handling: per-card "Offline / Last seen", a banner when nothing is reachable, polite retry back-off, and
  specific hints when a plug hangs up (probably newer firmware) or never answers.

## Protocol (`hs110.mjs`)
TCP port 9999. JSON, scrambled with the XOR autokey cipher (initial key 171, each byte XORed with the previous
**cipher** byte), preceded by a 4-byte big-endian length. UDP 9999 discovery uses the same cipher without the length.

| Command | Request |
| --- | --- |
| info | `{"system":{"get_sysinfo":{}}}` |
| switch | `{"system":{"set_relay_state":{"state":0\|1}}}` |
| live power | `{"emeter":{"get_realtime":{}}}` |
| per-day / per-month energy | `{"emeter":{"get_daystat":{"year":Y,"month":M}}}` / `{"emeter":{"get_monthstat":{"year":Y}}}` |
| poll (every 2 s) | `{"system":{"get_sysinfo":{}},"emeter":{"get_realtime":{}}}` in one round trip |

Hardware v1 reports `power` / `voltage` / `current` / `total` (W, V, A, kWh) and `energy` per day; hardware v2 reports
`power_mw` / `voltage_mv` / `current_ma` / `total_wh` and `energy_wh`. `normalizeRealtime` and friends accept both.

## Files
| File | What |
| --- | --- |
| `hs110.mjs` | cipher, framing, commands, v1/v2 normalisers, client, discovery, error wording |
| `transport.mjs` | native (Capacitor `SmartNet` plugin) transport + base64 helpers |
| `sim.mjs` | in-app HS110 simulator that speaks the real wire protocol (demo mode) |
| `store.mjs`, `charts.mjs`, `app.mjs`, `styles.css`, `index.html` | UI |
| `test/` | tests and the mock HS110 (not shipped in the APK) |

## Tests (no real plug needed)
```bash
cd smart-home
node --test test/protocol.test.mjs          # cipher vectors + client vs the Python mock HS110 (hw v1, hw v2, dribbled replies, hang-up, silence, discovery)
python3 -m http.server 8811 &               # then:
node test/ui-shots.cjs                      # demo-mode UI behaviour + screenshots (needs puppeteer-core)
node test/native-shim-e2e.cjs               # the app's native code path with a fake Capacitor bridge, real sockets to the mocks
../android/smart-home/test-jvm/run-test.sh  # the Android plugin's socket code (NetCore.java) on a plain JVM vs the mocks
```
`test/mock_hs110.py` is a stand-alone mock plug: `python3 test/mock_hs110.py --host 127.0.0.2 --hw 2 --mode ok|dribble|newfw|silent`.

## Caveats
- **Newer HS110 firmware / hardware.** This is the classic local protocol. TP-Link has been moving Kasa devices to an
  authenticated protocol (KLAP, needs the TP-Link account) in newer firmware. If a plug accepts the connection and then
  hangs up, or refuses port 9999, the app says its firmware may be too new. Not supported in Phase 1.
- Works only on the same Wi-Fi as the plug, and logs live history only while the app is open (the plug itself keeps the
  per-day/per-month kWh totals, which is what the charts use).
