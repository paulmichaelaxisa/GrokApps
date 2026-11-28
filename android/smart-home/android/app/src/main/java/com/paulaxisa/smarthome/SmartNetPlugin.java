package com.paulaxisa.smarthome;

import android.graphics.Color;
import android.util.Base64;
import android.view.View;
import android.view.Window;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import android.Manifest;
import android.net.wifi.WifiManager;

/**
 * Raw TCP/UDP for the Kasa local protocol. A WebView can't open sockets, so this tiny plugin does it.
 * All payloads are base64 strings; the cipher and JSON are handled in the web app.
 *
 * Every socket is bound to the Wi-Fi Network (not mobile data). UDP discovery holds a multicast lock,
 * uses the real subnet broadcast plus 255.255.255.255, listens at least 3 s and resends 3 times.
 * A TCP /24 sweep of the Wi-Fi subnet always runs as a fallback.
 */
@CapacitorPlugin(
    name = "SmartNet",
    permissions = {
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }),
        @Permission(alias = "nearby", strings = { "android.permission.NEARBY_WIFI_DEVICES" })
    }
)
public class SmartNetPlugin extends Plugin {
    private final ExecutorService pool = Executors.newCachedThreadPool();
    /** Shared snapshot so tcpRequest/polling use the same Wi-Fi Network as discovery. Refreshed often. */
    private volatile WifiNet.Snapshot lastSnap;

    private static byte[] b64(String s) { return Base64.decode(s, Base64.NO_WRAP); }
    private static String enc(byte[] d) { return Base64.encodeToString(d, Base64.NO_WRAP); }

    private WifiNet.Snapshot snap() {
        WifiNet.Snapshot s = WifiNet.inspect(getContext());
        lastSnap = s;
        return s;
    }

    private NetCore.SocketPrep prep(WifiNet.Snapshot s) {
        return WifiNet.binder(s);
    }

    private JSArray replyArray(List<NetCore.Reply> rs) {
        JSArray arr = new JSArray();
        for (NetCore.Reply r : rs) {
            JSObject o = new JSObject();
            o.put("host", r.host);
            o.put("data", enc(r.data));
            arr.put(o);
        }
        return arr;
    }

    private JSObject replies(List<NetCore.Reply> rs) {
        JSObject out = new JSObject();
        out.put("replies", replyArray(rs));
        return out;
    }

    private JSObject diagnostics(WifiNet.Snapshot s) {
        JSObject d = new JSObject();
        d.put("wifiIp", s.wifiIp == null ? "" : s.wifiIp);
        d.put("subnet", s.subnet == null ? "" : s.subnet);
        d.put("ssid", s.ssid == null ? "" : s.ssid);
        d.put("onWifi", s.onWifi);
        d.put("wifiBound", s.bound);
        d.put("multicastLock", s.multicastLock);
        d.put("udpSends", s.udpSends);
        d.put("udpListenMs", s.udpListenMs);
        d.put("udpReplies", s.udpReplies);
        d.put("hostsSwept", s.hostsSwept);
        d.put("tcpHits", s.tcpHits);
        JSArray b = new JSArray();
        for (String x : s.broadcasts) b.put(x);
        d.put("broadcast", b);
        JSObject p = new JSObject();
        p.put("nearbyWifi", s.nearbyPerm);
        p.put("location", s.locationPerm);
        p.put("localNetwork", s.localNetPerm);
        d.put("permissions", p);
        JSArray err = new JSArray();
        for (String e : s.errors) err.put(e);
        d.put("errors", err);
        return d;
    }

    /**
     * Ask for any Wi-Fi / location permissions this phone needs, then return a diagnostic snapshot
     * (Wi-Fi IP, subnet, SSID, permission state) so the UI can explain a failed search.
     */
    @PluginMethod
    public void prepare(PluginCall call) {
        List<String> aliases = new ArrayList<String>();
        aliases.add("location");
        if (android.os.Build.VERSION.SDK_INT >= 33) aliases.add("nearby");
        // If everything is already granted, just return the snapshot (no dialog).
        String[] missing = WifiNet.permissionsToRequest(getContext());
        if (missing.length == 0) {
            call.resolve(diagnostics(snap()));
            return;
        }
        requestPermissionForAliases(aliases.toArray(new String[0]), call, "prepareDone");
    }

    @PermissionCallback
    private void prepareDone(PluginCall call) {
        call.resolve(diagnostics(snap()));
    }

    @PluginMethod
    public void tcpRequest(final PluginCall call) {
        final String host = call.getString("host");
        final String data = call.getString("data");
        if (host == null || data == null) { call.reject("host and data are required", "badargs"); return; }
        final int port = call.getInt("port", 9999);
        final int timeout = call.getInt("timeoutMs", 3000);
        pool.execute(new Runnable() {
            public void run() {
                try {
                    WifiNet.Snapshot s = lastSnap != null && lastSnap.network != null ? lastSnap : snap();
                    byte[] reply = NetCore.tcpRequest(host, port, b64(data), timeout, prep(s));
                    JSObject o = new JSObject();
                    o.put("data", enc(reply));
                    call.resolve(o);
                } catch (NetCore.NetException e) {
                    call.reject(e.getMessage(), e.code);
                } catch (Exception e) {
                    call.reject(String.valueOf(e.getMessage()), "io");
                }
            }
        });
    }

    @PluginMethod
    public void udpDiscover(final PluginCall call) {
        final String data = call.getString("data");
        if (data == null) { call.reject("data is required", "badargs"); return; }
        final int port = call.getInt("port", 9999);
        final int timeout = Math.max(3000, call.getInt("timeoutMs", 3500));
        pool.execute(new Runnable() {
            public void run() {
                WifiManager.MulticastLock lock = null;
                try {
                    WifiNet.Snapshot s = snap();
                    lock = WifiNet.acquireMulticast(getContext(), s);
                    s.udpSends = 3;
                    s.udpListenMs = timeout;
                    List<NetCore.Reply> found = NetCore.udpDiscover(b64(data), port, timeout, 3, s.broadcasts, prep(s), s.errors);
                    s.udpReplies = found.size();
                    JSObject o = replies(found);
                    o.put("diagnostics", diagnostics(s));
                    call.resolve(o);
                } catch (NetCore.NetException e) {
                    call.reject(e.getMessage(), e.code);
                } finally {
                    WifiNet.releaseMulticast(lock);
                }
            }
        });
    }

    @PluginMethod
    public void tcpSweep(final PluginCall call) {
        final String data = call.getString("data");
        if (data == null) { call.reject("data is required", "badargs"); return; }
        final int port = call.getInt("port", 9999);
        final int timeout = call.getInt("timeoutMs", 600);
        JSArray h = call.getArray("hosts");
        List<String> hosts = null;
        if (h != null && h.length() > 0) {
            hosts = new ArrayList<String>();
            for (int i = 0; i < h.length(); i++) hosts.add(h.optString(i));
        }
        final List<String> given = hosts;
        pool.execute(new Runnable() {
            public void run() {
                WifiNet.Snapshot s = lastSnap != null && lastSnap.network != null ? lastSnap : snap();
                List<String> list = given != null ? given : s.sweepHosts;
                if (list == null) list = new ArrayList<String>();
                s.hostsSwept = list.size();
                List<NetCore.Reply> found = NetCore.tcpSweep(list, port, b64(data), timeout, 32, prep(s));
                s.tcpHits = found.size();
                JSObject o = replies(found);
                o.put("diagnostics", diagnostics(s));
                call.resolve(o);
            }
        });
    }

    /**
     * Combined discovery: request permissions are assumed already handled by prepare().
     * Holds the multicast lock, broadcasts 3 times for at least 3 s, and always runs the
     * TCP /24 sweep of the Wi-Fi subnet. Returns both sets of replies plus diagnostics.
     */
    @PluginMethod
    public void discover(final PluginCall call) {
        final String udp = call.getString("udp");
        final String tcp = call.getString("tcp");
        if (udp == null || tcp == null) { call.reject("udp and tcp payloads are required", "badargs"); return; }
        final int port = call.getInt("port", 9999);
        final int timeout = Math.max(3000, call.getInt("timeoutMs", 3500));
        final boolean sweep = call.getBoolean("sweep", true);
        pool.execute(new Runnable() {
            public void run() {
                WifiManager.MulticastLock lock = null;
                try {
                    WifiNet.Snapshot s = snap();
                    lock = WifiNet.acquireMulticast(getContext(), s);
                    s.udpSends = 3;
                    s.udpListenMs = timeout;
                    List<NetCore.Reply> udpFound;
                    try {
                        udpFound = NetCore.udpDiscover(b64(udp), port, timeout, 3, s.broadcasts, prep(s), s.errors);
                    } catch (NetCore.NetException e) {
                        s.errors.add("UDP: " + e.getMessage());
                        udpFound = new ArrayList<NetCore.Reply>();
                    }
                    s.udpReplies = udpFound.size();
                    List<NetCore.Reply> tcpFound = new ArrayList<NetCore.Reply>();
                    if (sweep) {
                        List<String> hosts = s.sweepHosts;
                        s.hostsSwept = hosts.size();
                        if (hosts.isEmpty()) {
                            s.errors.add("TCP sweep skipped: no Wi-Fi subnet to scan");
                        } else {
                            // 32 at a time, 600 ms each: a /24 takes about 5 s, in parallel with nothing else now
                            tcpFound = NetCore.tcpSweep(hosts, port, b64(tcp), 600, 32, prep(s));
                        }
                    }
                    s.tcpHits = tcpFound.size();
                    JSObject o = new JSObject();
                    o.put("udp", replyArray(udpFound));
                    o.put("tcp", replyArray(tcpFound));
                    o.put("diagnostics", diagnostics(s));
                    call.resolve(o);
                } catch (Exception e) {
                    call.reject(String.valueOf(e.getMessage()), "io");
                } finally {
                    WifiNet.releaseMulticast(lock);
                }
            }
        });
    }

    @PluginMethod
    public void localAddresses(PluginCall call) {
        WifiNet.Snapshot s = lastSnap != null && !lastSnap.wifiIp.isEmpty() ? lastSnap : snap();
        JSArray arr = new JSArray();
        if (s.wifiIp != null && !s.wifiIp.isEmpty()) arr.put(s.wifiIp);
        // also include any other Wi-Fi-like addresses, but never a cellular one
        for (String a : NetCore.wifiLikeIPv4()) {
            if (!a.equals(s.wifiIp)) arr.put(a);
        }
        JSObject o = new JSObject();
        o.put("addresses", arr);
        o.put("diagnostics", diagnostics(s));
        call.resolve(o);
    }

    /** Colour the strips behind the status and navigation bars to match the app theme (edge-to-edge). */
    @PluginMethod
    public void setChrome(final PluginCall call) {
        final String color = call.getString("color", "#0F1419");
        final boolean dark = call.getBoolean("dark", true);
        getActivity().runOnUiThread(new Runnable() {
            public void run() {
                try {
                    int c = Color.parseColor(color);
                    Window w = getActivity().getWindow();
                    View decor = w.getDecorView();
                    decor.setBackgroundColor(c);
                    View content = decor.findViewById(android.R.id.content);
                    if (content != null) content.setBackgroundColor(c);
                    WindowInsetsControllerCompat ctl = WindowCompat.getInsetsController(w, decor);
                    ctl.setAppearanceLightStatusBars(!dark);
                    ctl.setAppearanceLightNavigationBars(!dark);
                    call.resolve();
                } catch (Exception e) {
                    call.reject(String.valueOf(e.getMessage()));
                }
            }
        });
    }
}
