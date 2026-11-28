package com.paulaxisa.smarthome;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.ConnectException;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.net.NoRouteToHostException;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

/**
 * Plain-Java socket code for talking to TP-Link Kasa devices (no Android classes, so it can be
 * unit-tested on a normal JVM against the mock HS110 server).
 *
 * It only moves bytes. The XOR "autokey" cipher and the JSON live in the web app (hs110.mjs).
 * A TCP frame is a 4-byte big-endian length followed by that many bytes; tcpRequest sends the
 * frame it is given and returns the whole reply frame (header included).
 *
 * On Android, pass a SocketPrep (WifiNet.binder) so every socket is bound to the Wi-Fi Network
 * and does not go out over mobile data.
 */
public final class NetCore {
    private NetCore() {}

    public static final int MAX_FRAME = 256 * 1024;
    public static final int DEFAULT_UDP_SENDS = 3;

    /** Optional hook: bind a socket to a specific Network (Wi-Fi) before it is used. */
    public interface SocketPrep {
        void prepareTcp(Socket s) throws IOException;
        void prepareUdp(DatagramSocket s) throws IOException;
    }

    /** Error with a short machine code the web app turns into friendly words. */
    public static final class NetException extends Exception {
        public final String code;
        public NetException(String code, String message) { super(message); this.code = code; }
    }

    public static final class Reply {
        public final String host;
        public final byte[] data;
        public Reply(String host, byte[] data) { this.host = host; this.data = data; }
    }

    public static byte[] tcpRequest(String host, int port, byte[] frame, int timeoutMs) throws NetException {
        return tcpRequest(host, port, frame, timeoutMs, null);
    }

    /** Send one framed request and read one framed reply. */
    public static byte[] tcpRequest(String host, int port, byte[] frame, int timeoutMs, SocketPrep prep) throws NetException {
        long deadline = System.currentTimeMillis() + timeoutMs;
        Socket s = new Socket();
        try {
            s.setTcpNoDelay(true);
            if (prep != null) prep.prepareTcp(s);
            s.connect(new InetSocketAddress(host, port), Math.max(200, timeoutMs));
            OutputStream out = s.getOutputStream();
            out.write(frame);
            out.flush();
            InputStream in = s.getInputStream();
            byte[] head = readFully(s, in, 4, deadline);
            int len = ((head[0] & 0xff) << 24) | ((head[1] & 0xff) << 16) | ((head[2] & 0xff) << 8) | (head[3] & 0xff);
            if (len < 0 || len > MAX_FRAME) throw new NetException("badframe", "Unexpected reply length " + len);
            byte[] body = readFully(s, in, len, deadline);
            byte[] all = new byte[4 + len];
            System.arraycopy(head, 0, all, 0, 4);
            System.arraycopy(body, 0, all, 4, len);
            return all;
        } catch (NetException e) {
            throw e;
        } catch (ConnectException e) {
            String m = String.valueOf(e.getMessage()).toLowerCase();
            if (m.contains("refused")) throw new NetException("refused", "Connection refused");
            if (m.contains("timed out")) throw new NetException("timeout", "Timed out");
            throw new NetException("unreachable", "Can't reach device");
        } catch (NoRouteToHostException e) {
            throw new NetException("unreachable", "No route to host");
        } catch (SocketTimeoutException e) {
            throw new NetException("timeout", "Timed out");
        } catch (java.net.UnknownHostException e) {
            throw new NetException("badhost", "Not a valid address");
        } catch (IOException e) {
            String m = String.valueOf(e.getMessage()).toLowerCase();
            if (m.contains("network is unreachable") || m.contains("no route")) throw new NetException("unreachable", "Network unreachable");
            if (m.contains("reset") || m.contains("broken pipe") || m.contains("closed")) throw new NetException("closed", "Device closed the connection");
            if (m.contains("permission") || m.contains("eperm") || m.contains("eacces")) throw new NetException("permission", "The phone blocked local-network access");
            throw new NetException("io", String.valueOf(e.getMessage()));
        } finally {
            try { s.close(); } catch (IOException ignored) {}
        }
    }

    private static byte[] readFully(Socket s, InputStream in, int n, long deadline) throws IOException, NetException {
        byte[] buf = new byte[n];
        int got = 0;
        while (got < n) {
            long left = deadline - System.currentTimeMillis();
            if (left <= 0) throw new NetException("timeout", "Timed out");
            s.setSoTimeout((int) Math.max(50, left));
            int r = in.read(buf, got, n - got);
            if (r < 0) throw new NetException("closed", "Device closed the connection");
            got += r;
        }
        return buf;
    }

    public static List<Reply> udpDiscover(byte[] payload, int port, int timeoutMs) throws NetException {
        return udpDiscover(payload, port, timeoutMs, DEFAULT_UDP_SENDS, null, null, null);
    }

    /**
     * UDP broadcast of an unframed payload; collects replies until timeoutMs.
     * Sends {@code sends} times (default 3) and keeps listening for the whole window.
     * {@code broadcasts} of null means 255.255.255.255 plus each interface broadcast.
     */
    public static List<Reply> udpDiscover(byte[] payload, int port, int timeoutMs, int sends,
                                          List<String> broadcasts, SocketPrep prep, List<String> errors) throws NetException {
        if (sends < 1) sends = DEFAULT_UDP_SENDS;
        if (timeoutMs < 1) timeoutMs = 3000;
        List<Reply> found = new ArrayList<Reply>();
        Set<String> seen = new LinkedHashSet<String>();
        DatagramSocket sock = null;
        try {
            sock = new DatagramSocket(null);
            sock.setReuseAddress(true);
            sock.setBroadcast(true);
            if (prep != null) prep.prepareUdp(sock);
            sock.bind(new InetSocketAddress(0));
            Set<String> targets = new LinkedHashSet<String>();
            if (broadcasts != null && !broadcasts.isEmpty()) {
                targets.addAll(broadcasts);
            } else {
                targets.add("255.255.255.255");
                try {
                    Enumeration<NetworkInterface> nis = NetworkInterface.getNetworkInterfaces();
                    while (nis != null && nis.hasMoreElements()) {
                        NetworkInterface ni = nis.nextElement();
                        if (!ni.isUp() || ni.isLoopback()) continue;
                        for (InterfaceAddress ia : ni.getInterfaceAddresses()) {
                            if (ia.getBroadcast() != null) targets.add(ia.getBroadcast().getHostAddress());
                        }
                    }
                } catch (IOException ignored) {}
            }
            if (!targets.contains("255.255.255.255")) targets.add("255.255.255.255");
            long start = System.currentTimeMillis();
            long deadline = start + timeoutMs;
            for (int round = 0; round < sends; round++) {
                for (String t : targets) {
                    try {
                        sock.send(new DatagramPacket(payload, payload.length, InetAddress.getByName(t), port));
                    } catch (IOException e) {
                        if (errors != null) errors.add("UDP send to " + t + ": " + e.getMessage());
                    }
                }
                long until = (round == sends - 1)
                    ? deadline
                    : Math.min(deadline, start + (long) (round + 1) * timeoutMs / sends);
                byte[] buf = new byte[8192];
                while (true) {
                    long left = until - System.currentTimeMillis();
                    if (left <= 0) break;
                    sock.setSoTimeout((int) Math.max(1, left));
                    DatagramPacket p = new DatagramPacket(buf, buf.length);
                    try {
                        sock.receive(p);
                    } catch (SocketTimeoutException e) { break; }
                    String h = p.getAddress().getHostAddress();
                    if (seen.add(h)) {
                        byte[] d = new byte[p.getLength()];
                        System.arraycopy(p.getData(), p.getOffset(), d, 0, p.getLength());
                        found.add(new Reply(h, d));
                    }
                }
            }
            return found;
        } catch (IOException e) {
            if (errors != null) errors.add("UDP socket: " + e.getMessage());
            throw new NetException("io", String.valueOf(e.getMessage()));
        } finally {
            if (sock != null) sock.close();
        }
    }

    /** The phone's own IPv4 addresses on non-loopback interfaces. */
    public static List<String> localIPv4() {
        List<String> out = new ArrayList<String>();
        try {
            Enumeration<NetworkInterface> nis = NetworkInterface.getNetworkInterfaces();
            while (nis != null && nis.hasMoreElements()) {
                NetworkInterface ni = nis.nextElement();
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InterfaceAddress ia : ni.getInterfaceAddresses()) {
                    InetAddress a = ia.getAddress();
                    if (a instanceof Inet4Address && a.isSiteLocalAddress()) out.add(a.getHostAddress());
                }
            }
        } catch (IOException ignored) {}
        return out;
    }

    /** IPv4 addresses on interfaces that look like Wi-Fi (not cellular / VPN / loopback). */
    public static List<String> wifiLikeIPv4() {
        List<String> out = new ArrayList<String>();
        try {
            Enumeration<NetworkInterface> nis = NetworkInterface.getNetworkInterfaces();
            while (nis != null && nis.hasMoreElements()) {
                NetworkInterface ni = nis.nextElement();
                if (!ni.isUp() || ni.isLoopback() || !looksLikeWifi(ni.getName())) continue;
                for (InterfaceAddress ia : ni.getInterfaceAddresses()) {
                    InetAddress a = ia.getAddress();
                    if (a instanceof Inet4Address && !a.isLoopbackAddress()) out.add(a.getHostAddress());
                }
            }
        } catch (IOException ignored) {}
        return out;
    }

    /** Broadcast addresses of Wi-Fi-like interfaces, plus 255.255.255.255. */
    public static List<String> interfaceBroadcasts() {
        Set<String> out = new LinkedHashSet<String>();
        try {
            Enumeration<NetworkInterface> nis = NetworkInterface.getNetworkInterfaces();
            while (nis != null && nis.hasMoreElements()) {
                NetworkInterface ni = nis.nextElement();
                if (!ni.isUp() || ni.isLoopback()) continue;
                boolean wifi = looksLikeWifi(ni.getName());
                for (InterfaceAddress ia : ni.getInterfaceAddresses()) {
                    if (ia.getBroadcast() != null && (wifi || ia.getAddress() instanceof Inet4Address)) {
                        if (wifi) out.add(ia.getBroadcast().getHostAddress());
                    }
                }
            }
        } catch (IOException ignored) {}
        out.add("255.255.255.255");
        return new ArrayList<String>(out);
    }

    public static boolean looksLikeWifi(String name) {
        if (name == null) return false;
        String n = name.toLowerCase();
        if (n.startsWith("rmnet") || n.startsWith("ccmni") || n.startsWith("tun") || n.startsWith("tap")
            || n.startsWith("ppp") || n.startsWith("dummy") || n.startsWith("lo") || n.startsWith("bt")
            || n.contains("usb") || n.startsWith("v4-") || n.startsWith("ipsec") || n.startsWith("wlan-p2p"))
            return false;
        return n.startsWith("wlan") || n.startsWith("swlan") || n.startsWith("ap") || n.startsWith("wifi");
    }

    /**
     * Hosts to probe on the subnet of {@code ip}/{@code prefix}.
     * Prefix &lt; 24 (a wide network) is narrowed to the /24 containing this phone, so a sweep stays quick.
     * Prefix &gt; 24 uses the actual smaller subnet. The phone's own address is skipped.
     */
    public static List<String> hostsOnSubnet(String ip, int prefix) {
        List<String> hosts = new ArrayList<String>();
        int addr = ipv4ToInt(ip);
        if (addr == 0 && (ip == null || ip.isEmpty())) return hosts;
        int usePrefix = prefix;
        if (usePrefix < 24 || usePrefix > 32) usePrefix = 24;
        int mask = usePrefix == 0 ? 0 : (0xFFFFFFFF << (32 - usePrefix));
        int network = addr & mask;
        int broadcast = network | ~mask;
        for (int a = network + 1; a < broadcast; a++) {
            if (a == addr) continue;
            hosts.add(intToIpv4(a));
        }
        return hosts;
    }

    public static String networkCidr(String ip, int prefix) {
        int addr = ipv4ToInt(ip);
        int p = (prefix < 0 || prefix > 32) ? 24 : prefix;
        int mask = p == 0 ? 0 : (0xFFFFFFFF << (32 - p));
        return intToIpv4(addr & mask) + "/" + p;
    }

    public static String broadcastOf(String ip, int prefix) {
        int addr = ipv4ToInt(ip);
        int p = (prefix < 0 || prefix > 32) ? 24 : prefix;
        int mask = p == 0 ? 0 : (0xFFFFFFFF << (32 - p));
        return intToIpv4((addr & mask) | ~mask);
    }

    public static int ipv4ToInt(String ip) {
        if (ip == null) return 0;
        String[] p = ip.split("\\.");
        if (p.length != 4) return 0;
        try {
            long v = 0;
            for (int i = 0; i < 4; i++) {
                int n = Integer.parseInt(p[i]);
                if (n < 0 || n > 255) return 0;
                v = (v << 8) | n;
            }
            return (int) v;
        } catch (NumberFormatException e) { return 0; }
    }

    public static String intToIpv4(int v) {
        return ((v >>> 24) & 0xff) + "." + ((v >>> 16) & 0xff) + "." + ((v >>> 8) & 0xff) + "." + (v & 0xff);
    }

    /** Hosts on the same /24 as each local address (skipping our own). Prefer Wi-Fi-like interfaces. */
    public static List<String> subnetHosts() {
        List<String> ips = wifiLikeIPv4();
        if (ips.isEmpty()) ips = localIPv4();
        List<String> hosts = new ArrayList<String>();
        for (String ip : ips) {
            for (String h : hostsOnSubnet(ip, 24)) {
                if (!hosts.contains(h)) hosts.add(h);
            }
        }
        return hosts;
    }

    public static List<Reply> tcpSweep(List<String> hosts, final int port, final byte[] frame, final int timeoutMs, int threads) {
        return tcpSweep(hosts, port, frame, timeoutMs, threads, null);
    }

    /** Ask every host on the list (default: the Wi-Fi /24) for a TCP reply. Used when broadcast is filtered. */
    public static List<Reply> tcpSweep(List<String> hosts, final int port, final byte[] frame, final int timeoutMs, int threads, final SocketPrep prep) {
        if (hosts == null) hosts = subnetHosts();
        if (hosts.isEmpty()) return new ArrayList<Reply>();
        ExecutorService ex = Executors.newFixedThreadPool(Math.max(1, threads));
        List<Future<Reply>> futs = new ArrayList<Future<Reply>>();
        for (final String h : hosts) {
            futs.add(ex.submit(new Callable<Reply>() {
                public Reply call() {
                    try {
                        return new Reply(h, tcpRequest(h, port, frame, timeoutMs, prep));
                    } catch (NetException e) {
                        return null;
                    }
                }
            }));
        }
        List<Reply> out = new ArrayList<Reply>();
        for (Future<Reply> f : futs) {
            try {
                Reply r = f.get();
                if (r != null) out.add(r);
            } catch (Exception ignored) {}
        }
        ex.shutdown();
        return out;
    }
}
