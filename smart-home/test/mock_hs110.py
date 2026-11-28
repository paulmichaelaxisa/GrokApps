#!/usr/bin/env python3
"""Mock TP-Link HS110 for testing the Smart Home app's protocol code without the real plug.

Speaks the real local protocol: TCP 9999, 4-byte big-endian length + XOR autokey (key 171) JSON,
and UDP 9999 discovery (same cipher, no length). Handles several modules per request like the real plug.

  python3 mock_hs110.py --host 127.0.0.2 --hw 1     # hw v1 style: power/voltage/current/total, energy in kWh
  python3 mock_hs110.py --host 127.0.0.3 --hw 2     # hw v2 style: power_mw/voltage_mv/current_ma/total_wh, energy_wh
  --mode ok|dribble|newfw|silent                     # dribble: reply in tiny chunks; newfw: accept then hang up;
                                                      # silent: accept and never answer
"""
import argparse, hashlib, json, math, socket, struct, threading, time, datetime, random

def encrypt(s: bytes) -> bytes:
    key, out = 171, bytearray()
    for b in s:
        key ^= b
        out.append(key)
    return bytes(out)

def decrypt(s: bytes) -> bytes:
    key, out = 171, bytearray()
    for b in s:
        out.append(key ^ b)
        key = b
    return bytes(out)

LOGFILE = None

class Plug:
    def __init__(self, hw, alias):
        self.hw = hw
        self.alias = alias
        self.relay = 1
        self.t0 = time.time()
        self.total_wh = 12345.0
        self.lock = threading.Lock()
        self.log = []   # every decoded request, for the tests to inspect

    def watts(self):
        if not self.relay:
            return 0.0
        return 87.4 + 6 * math.sin((time.time() - self.t0) / 3.0)

    def sysinfo(self):
        return {
            "sw_ver": "1.2.5 Build 171206 Rel.085954" if self.hw == 1 else "1.5.10 Build 191125 Rel.143500",
            "hw_ver": "1.0" if self.hw == 1 else "2.0",
            "model": "HS110(AU)", "deviceId": hashlib.sha1((self.alias + str(self.hw)).encode()).hexdigest().upper(),
            "alias": self.alias, "mac": "50:C7:BF:12:34:56" if self.hw == 1 else "B0:95:75:AB:CD:EF",
            "relay_state": self.relay, "on_time": int(time.time() - self.t0) if self.relay else 0,
            "feature": "TIM:ENE", "rssi": -52, "led_off": 0, "updating": 0, "active_mode": "none", "err_code": 0,
        }

    def realtime(self):
        w = self.watts()
        volts = 241.3
        amps = w / volts
        if self.hw == 1:
            return {"power": round(w, 3), "voltage": volts, "current": round(amps, 4), "total": round(self.total_wh / 1000, 3), "err_code": 0}
        return {"power_mw": int(w * 1000), "voltage_mv": int(volts * 1000), "current_ma": int(amps * 1000), "total_wh": int(self.total_wh), "err_code": 0}

    def daystat(self, year, month):
        days = []
        today = datetime.date.today()
        last = today.day if (year, month) == (today.year, today.month) else 28
        for d in range(1, last + 1):
            kwh = round(0.8 + (d * 37 % 11) / 10, 3) if d < today.day or (year, month) != (today.year, today.month) else 0.42
            days.append(self._energy({"year": year, "month": month, "day": d}, kwh))
        return {"day_list": days, "err_code": 0}

    def monthstat(self, year):
        months = []
        today = datetime.date.today()
        last = today.month if year == today.year else 12
        for m in range(1, last + 1):
            months.append(self._energy({"year": year, "month": m}, round(18 + (m * 53 % 17), 2)))
        return {"month_list": months, "err_code": 0}

    def _energy(self, base, kwh):
        if self.hw == 1:
            base["energy"] = kwh
        else:
            base["energy_wh"] = int(kwh * 1000)
        return base

    def handle(self, req):
        with self.lock:
            self.log.append(req)
            if LOGFILE:
                with open(LOGFILE, 'a') as f: f.write(json.dumps(req, separators=(',', ':')) + '\n')
            resp = {}
            for mod, cmds in req.items():
                resp[mod] = {}
                for cmd, arg in (cmds or {}).items():
                    resp[mod][cmd] = self.run(mod, cmd, arg or {})
            return resp

    def run(self, mod, cmd, arg):
        if (mod, cmd) == ("system", "get_sysinfo"):
            return self.sysinfo()
        if (mod, cmd) == ("system", "set_relay_state"):
            self.relay = 1 if arg.get("state") else 0
            return {"err_code": 0}
        if (mod, cmd) == ("emeter", "get_realtime"):
            return self.realtime()
        if (mod, cmd) == ("emeter", "get_daystat"):
            return self.daystat(arg.get("year"), arg.get("month"))
        if (mod, cmd) == ("emeter", "get_monthstat"):
            return self.monthstat(arg.get("year"))
        return {"err_code": -2, "err_msg": "member not support"}

def recv_exact(c, n):
    buf = b""
    while len(buf) < n:
        d = c.recv(n - len(buf))
        if not d:
            raise EOFError
        buf += d
    return buf

def serve_tcp(plug, host, port, mode):
    srv = socket.socket(); srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind((host, port)); srv.listen(16)
    def conn(c):
        try:
            c.settimeout(5)
            if mode == "newfw":
                c.close(); return
            ln = struct.unpack(">I", recv_exact(c, 4))[0]
            req = json.loads(decrypt(recv_exact(c, ln)))
            if mode == "silent":
                time.sleep(10); return
            body = encrypt(json.dumps(plug.handle(req)).encode())
            out = struct.pack(">I", len(body)) + body
            if mode == "dribble":
                for i in range(0, len(out), 7):
                    c.sendall(out[i:i + 7]); time.sleep(0.004)
            else:
                c.sendall(out)
        except Exception:
            pass
        finally:
            try: c.close()
            except Exception: pass
    while True:
        c, _ = srv.accept()
        threading.Thread(target=conn, args=(c,), daemon=True).start()

def serve_udp(plug, host, port):
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind((host, port))
    while True:
        data, addr = s.recvfrom(4096)
        try:
            req = json.loads(decrypt(data))
            s.sendto(encrypt(json.dumps(plug.handle(req)).encode()), addr)
        except Exception:
            pass

def start(host="127.0.0.1", port=9999, hw=1, alias="Office Heater", mode="ok", udp=True, tcp=True):
    plug = Plug(hw, alias)
    if tcp:
        threading.Thread(target=serve_tcp, args=(plug, host, port, mode), daemon=True).start()
    if udp:
        threading.Thread(target=serve_udp, args=(plug, host, port), daemon=True).start()
    return plug

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=9999)
    ap.add_argument("--hw", type=int, default=1, choices=[1, 2])
    ap.add_argument("--udp-only", action="store_true", help="only answer UDP discovery (lets one mock listen on 0.0.0.0 next to per-address TCP mocks)")
    ap.add_argument("--log", default=None, help="append every decoded request as a JSON line")
    ap.add_argument("--alias", default="Office Heater")
    ap.add_argument("--mode", default="ok", choices=["ok", "dribble", "newfw", "silent"])
    a = ap.parse_args()
    LOGFILE = a.log
    start(a.host, a.port, a.hw, a.alias, a.mode, tcp=not a.udp_only)
    print(f"mock HS110 hw v{a.hw} ({a.mode}) on {a.host}:{a.port} (TCP+UDP)", flush=True)
    while True:
        time.sleep(3600)
