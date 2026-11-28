package com.paulaxisa.smarthome;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.RouteInfo;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.os.Build;

import androidx.core.content.ContextCompat;

import java.io.IOException;
import java.net.DatagramSocket;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.Socket;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;

/**
 * Android-only helper: find the Wi-Fi Network, read its IPv4 / subnet / broadcast from
 * LinkProperties, bind sockets onto that Network (so traffic does not go out over mobile
 * data), and hold a WifiManager.MulticastLock so the radio actually delivers UDP broadcasts.
 */
public final class WifiNet {
    public static final String NEARBY_WIFI = "android.permission.NEARBY_WIFI_DEVICES";
    public static final String ACCESS_LOCAL_NETWORK = "android.permission.ACCESS_LOCAL_NETWORK";

    private WifiNet() {}

    public static final class Snapshot {
        public Network network;
        public String wifiIp = "";
        public int prefix = -1;
        public String subnet = "";
        public String ssid = "";
        public boolean onWifi;
        public boolean bound;
        public boolean multicastLock;
        public final List<String> broadcasts = new ArrayList<String>();
        public final List<String> sweepHosts = new ArrayList<String>();
        public final List<String> errors = new ArrayList<String>();
        public String nearbyPerm = "not-applicable";
        public String locationPerm = "not-requested";
        public String localNetPerm = "not-applicable";
        public int udpSends = 0;
        public int udpListenMs = 0;
        public int udpReplies = 0;
        public int tcpHits = 0;
        public int hostsSwept = 0;
    }

    public static String permStatus(Context ctx, String perm, boolean applicable) {
        if (!applicable) return "not-applicable";
        int r = ContextCompat.checkSelfPermission(ctx, perm);
        if (r == PackageManager.PERMISSION_GRANTED) return "granted";
        if (r == PackageManager.PERMISSION_DENIED) return "denied";
        return "unknown";
    }

    public static String[] permissionsToRequest(Context ctx) {
        List<String> need = new ArrayList<String>();
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(ctx, NEARBY_WIFI) != PackageManager.PERMISSION_GRANTED) {
            need.add(NEARBY_WIFI);
        }
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            need.add(Manifest.permission.ACCESS_FINE_LOCATION);
        }
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            need.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        }
        // ACCESS_LOCAL_NETWORK is only required when the app *targets* API 37+. We target 35, so
        // INTERNET already grants local-network access (Android docs, Nov 2026). Still request it
        // on devices running API 37+ in case the user later updates, if the platform knows the name.
        if (Build.VERSION.SDK_INT >= 37 && ContextCompat.checkSelfPermission(ctx, ACCESS_LOCAL_NETWORK) != PackageManager.PERMISSION_GRANTED) {
            need.add(ACCESS_LOCAL_NETWORK);
        }
        return need.toArray(new String[0]);
    }

    public static Snapshot inspect(Context ctx) {
        Snapshot s = new Snapshot();
        s.nearbyPerm = permStatus(ctx, NEARBY_WIFI, Build.VERSION.SDK_INT >= 33);
        s.locationPerm = permStatus(ctx, Manifest.permission.ACCESS_FINE_LOCATION, true);
        s.localNetPerm = permStatus(ctx, ACCESS_LOCAL_NETWORK, Build.VERSION.SDK_INT >= 37);
        // implicit grant while we target API 35
        if (Build.VERSION.SDK_INT < 37) s.localNetPerm = "not-required (targetSdk 35)";

        ConnectivityManager cm = (ConnectivityManager) ctx.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) {
            s.errors.add("No ConnectivityManager");
            fallbackFromInterfaces(s);
            return s;
        }
        s.network = findWifi(cm, s);
        if (s.network != null) {
            s.onWifi = true;
            readLink(cm, s);
            readSsid(ctx, cm, s);
        }
        if (s.wifiIp.isEmpty()) fallbackFromInterfaces(s);
        finishSubnet(s);
        return s;
    }

    private static Network findWifi(ConnectivityManager cm, Snapshot s) {
        Network[] nets;
        try {
            nets = cm.getAllNetworks();
        } catch (Exception e) {
            s.errors.add("getAllNetworks: " + e.getMessage());
            return null;
        }
        Network best = null;
        for (Network n : nets) {
            NetworkCapabilities caps;
            try { caps = cm.getNetworkCapabilities(n); } catch (Exception e) { continue; }
            if (caps == null) continue;
            if (!caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) continue;
            if (caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) continue;
            best = n;
            // prefer a network that has an IPv4 address already
            try {
                LinkProperties lp = cm.getLinkProperties(n);
                if (lp != null && ipv4Of(lp) != null) return n;
            } catch (Exception ignored) {}
        }
        return best;
    }

    private static Inet4Address ipv4Of(LinkProperties lp) {
        for (LinkAddress la : lp.getLinkAddresses()) {
            InetAddress a = la.getAddress();
            if (a instanceof Inet4Address && !a.isLoopbackAddress()) return (Inet4Address) a;
        }
        return null;
    }

    private static void readLink(ConnectivityManager cm, Snapshot s) {
        LinkProperties lp;
        try { lp = cm.getLinkProperties(s.network); } catch (Exception e) {
            s.errors.add("LinkProperties: " + e.getMessage());
            return;
        }
        if (lp == null) { s.errors.add("Wi-Fi LinkProperties was empty"); return; }
        for (LinkAddress la : lp.getLinkAddresses()) {
            InetAddress a = la.getAddress();
            if (!(a instanceof Inet4Address) || a.isLoopbackAddress()) continue;
            s.wifiIp = a.getHostAddress();
            s.prefix = la.getPrefixLength();
            break;
        }
        // also collect any broadcast-like routes
        try {
            for (RouteInfo r : lp.getRoutes()) {
                if (r.isDefaultRoute()) continue;
            }
        } catch (Exception ignored) {}
    }

    private static void readSsid(Context ctx, ConnectivityManager cm, Snapshot s) {
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                NetworkCapabilities caps = cm.getNetworkCapabilities(s.network);
                if (caps != null && caps.getTransportInfo() instanceof WifiInfo) {
                    String ssid = ((WifiInfo) caps.getTransportInfo()).getSSID();
                    s.ssid = tidySsid(ssid);
                    if (!s.ssid.isEmpty()) return;
                }
            }
        } catch (Exception e) {
            s.errors.add("SSID (NetworkCapabilities): " + e.getMessage());
        }
        try {
            WifiManager wm = (WifiManager) ctx.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm == null) return;
            @SuppressWarnings("deprecation")
            WifiInfo info = wm.getConnectionInfo();
            if (info != null) s.ssid = tidySsid(info.getSSID());
        } catch (SecurityException e) {
            s.errors.add("SSID needs location permission on this phone");
        } catch (Exception e) {
            s.errors.add("SSID: " + e.getMessage());
        }
    }

    private static String tidySsid(String ssid) {
        if (ssid == null || ssid.isEmpty() || "<unknown ssid>".equalsIgnoreCase(ssid) || "0x".equals(ssid)) return "";
        if (ssid.length() >= 2 && ssid.startsWith("\"") && ssid.endsWith("\"")) return ssid.substring(1, ssid.length() - 1);
        return ssid;
    }

    private static void fallbackFromInterfaces(Snapshot s) {
        List<String> ips = NetCore.wifiLikeIPv4();
        if (ips.isEmpty()) return;
        if (s.wifiIp.isEmpty()) {
            s.wifiIp = ips.get(0);
            s.prefix = 24;
            s.onWifi = true;
            s.errors.add("Used the Wi-Fi interface address (LinkProperties had no IPv4)");
        }
    }

    private static void finishSubnet(Snapshot s) {
        LinkedHashSet<String> bcast = new LinkedHashSet<String>();
        if (!s.wifiIp.isEmpty()) {
            if (s.prefix < 0 || s.prefix > 32) s.prefix = 24;
            s.subnet = NetCore.networkCidr(s.wifiIp, s.prefix);
            bcast.add(NetCore.broadcastOf(s.wifiIp, s.prefix));
            int sweepPrefix = s.prefix < 24 ? 24 : s.prefix;
            s.sweepHosts.addAll(NetCore.hostsOnSubnet(s.wifiIp, sweepPrefix));
            if (s.prefix < 24) {
                s.errors.add("Wi-Fi network is " + s.subnet + "; swept the /24 containing this phone (" + s.sweepHosts.size() + " addresses)");
            }
        } else {
            // last resort: interface broadcasts only (and still try a sweep of Wi-Fi-like /24s)
            bcast.addAll(NetCore.interfaceBroadcasts());
            s.sweepHosts.addAll(NetCore.subnetHosts());
            if (!s.onWifi) s.errors.add("No Wi-Fi IPv4 address. Is the phone on Wi-Fi?");
        }
        bcast.add("255.255.255.255");
        s.broadcasts.addAll(bcast);
        s.hostsSwept = s.sweepHosts.size();
    }

    /** Bind this TCP socket to the Wi-Fi Network. Must be called before connect(). */
    public static void prepareTcp(Snapshot s, Socket sock) throws IOException {
        if (s == null || s.network == null) return;
        try {
            s.network.bindSocket(sock);
            s.bound = true;
        } catch (IOException e) {
            s.errors.add("bindSocket(TCP): " + e.getMessage());
            throw e;
        }
    }

    /** Bind this UDP socket to the Wi-Fi Network. Must be called after construction, before bind(). */
    public static void prepareUdp(Snapshot s, DatagramSocket sock) throws IOException {
        if (s == null || s.network == null) return;
        try {
            s.network.bindSocket(sock);
            s.bound = true;
        } catch (IOException e) {
            s.errors.add("bindSocket(UDP): " + e.getMessage());
            throw e;
        }
    }

    public static NetCore.SocketPrep binder(final Snapshot s) {
        return new NetCore.SocketPrep() {
            public void prepareTcp(Socket sock) throws IOException { WifiNet.prepareTcp(s, sock); }
            public void prepareUdp(DatagramSocket sock) throws IOException { WifiNet.prepareUdp(s, sock); }
        };
    }

    /** Acquire a multicast lock so the Wi-Fi radio delivers UDP broadcasts. Caller must release(). */
    public static WifiManager.MulticastLock acquireMulticast(Context ctx, Snapshot s) {
        try {
            WifiManager wm = (WifiManager) ctx.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm == null) { s.errors.add("No WifiManager for multicast lock"); return null; }
            WifiManager.MulticastLock lock = wm.createMulticastLock("smarthome-kasa");
            lock.setReferenceCounted(false);
            lock.acquire();
            s.multicastLock = lock.isHeld();
            if (!s.multicastLock) s.errors.add("Multicast lock was not held after acquire()");
            return lock;
        } catch (Exception e) {
            s.errors.add("Multicast lock: " + e.getMessage());
            return null;
        }
    }

    public static void releaseMulticast(WifiManager.MulticastLock lock) {
        if (lock == null) return;
        try { if (lock.isHeld()) lock.release(); } catch (Exception ignored) {}
    }
}
