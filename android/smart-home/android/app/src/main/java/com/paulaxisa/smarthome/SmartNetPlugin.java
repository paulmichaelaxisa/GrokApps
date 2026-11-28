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

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Raw TCP/UDP for the Kasa local protocol. A WebView can't open sockets, so this tiny plugin does it.
 * All payloads are base64 strings; the cipher and JSON are handled in the web app.
 */
@CapacitorPlugin(name = "SmartNet")
public class SmartNetPlugin extends Plugin {
    // cached pool: a few devices polled at once, plus discovery, must not queue behind each other
    private final ExecutorService pool = Executors.newCachedThreadPool();

    private static byte[] b64(String s) { return Base64.decode(s, Base64.NO_WRAP); }
    private static String enc(byte[] d) { return Base64.encodeToString(d, Base64.NO_WRAP); }

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
                    byte[] reply = NetCore.tcpRequest(host, port, b64(data), timeout);
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

    private JSObject replies(List<NetCore.Reply> rs) {
        JSArray arr = new JSArray();
        for (NetCore.Reply r : rs) {
            JSObject o = new JSObject();
            o.put("host", r.host);
            o.put("data", enc(r.data));
            arr.put(o);
        }
        JSObject out = new JSObject();
        out.put("replies", arr);
        return out;
    }

    @PluginMethod
    public void udpDiscover(final PluginCall call) {
        final String data = call.getString("data");
        if (data == null) { call.reject("data is required", "badargs"); return; }
        final int port = call.getInt("port", 9999);
        final int timeout = call.getInt("timeoutMs", 2500);
        pool.execute(new Runnable() {
            public void run() {
                try {
                    call.resolve(replies(NetCore.udpDiscover(b64(data), port, timeout)));
                } catch (NetCore.NetException e) {
                    call.reject(e.getMessage(), e.code);
                }
            }
        });
    }

    @PluginMethod
    public void tcpSweep(final PluginCall call) {
        final String data = call.getString("data");
        if (data == null) { call.reject("data is required", "badargs"); return; }
        final int port = call.getInt("port", 9999);
        final int timeout = call.getInt("timeoutMs", 700);
        JSArray h = call.getArray("hosts");
        List<String> hosts = null;
        if (h != null) {
            hosts = new ArrayList<String>();
            for (int i = 0; i < h.length(); i++) hosts.add(h.optString(i));
        }
        final List<String> hostList = hosts;
        pool.execute(new Runnable() {
            public void run() {
                call.resolve(replies(NetCore.tcpSweep(hostList, port, b64(data), timeout, 48)));
            }
        });
    }

    @PluginMethod
    public void localAddresses(PluginCall call) {
        JSArray arr = new JSArray();
        for (String a : NetCore.localIPv4()) arr.put(a);
        JSObject o = new JSObject();
        o.put("addresses", arr);
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
