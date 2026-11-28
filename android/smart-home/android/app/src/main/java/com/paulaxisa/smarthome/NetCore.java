package com.paulaxisa.smarthome;

import java.io.ByteArrayOutputStream;
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
import java.util.Collections;
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
 */
public final class NetCore {
    private NetCore() {}

    public static final int MAX_FRAME = 256 * 1024;

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

    /** Send one framed request and read one framed reply. */
    public static byte[] tcpRequest(String host, int port, byte[] frame, int timeoutMs) throws NetException {
        long deadline = System.currentTimeMillis() + timeoutMs;
        Socket s = new Socket();
        try {
            s.setTcpNoDelay(true);
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

    /** UDP broadcast of an unframed payload; collects replies until timeoutMs. */
    public static List<Reply> udpDiscover(byte[] payload, int port, int timeoutMs) throws NetException {
        List<Reply> found = new ArrayList<Reply>();
        Set<String> seen = new LinkedHashSet<String>();
        DatagramSocket sock = null;
        try {
            sock = new DatagramSocket(null);
            sock.setReuseAddress(true);
            sock.setBroadcast(true);
            sock.bind(new InetSocketAddress(0));
            Set<String> targets = new LinkedHashSet<String>();
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
            long deadline = System.currentTimeMillis() + timeoutMs;
            // send twice: UDP is lossy and cheap plugs are sleepy
            for (int round = 0; round < 2; round++) {
                for (String t : targets) {
                    try {
                        sock.send(new DatagramPacket(payload, payload.length, InetAddress.getByName(t), port));
                    } catch (IOException ignored) {}
                }
                long until = round == 0 ? Math.min(deadline, System.currentTimeMillis() + Math.max(200, timeoutMs / 3)) : deadline;
                byte[] buf = new byte[8192];
                while (true) {
                    long left = until - System.currentTimeMillis();
                    if (left <= 0) break;
                    sock.setSoTimeout((int) left);
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

    /** Hosts on the same /24 as each local address (skipping our own). */
    public static List<String> subnetHosts() {
        List<String> hosts = new ArrayList<String>();
        for (String ip : localIPv4()) {
            String prefix = ip.substring(0, ip.lastIndexOf('.') + 1);
            for (int i = 1; i <= 254; i++) {
                String h = prefix + i;
                if (!h.equals(ip) && !hosts.contains(h)) hosts.add(h);
            }
        }
        return hosts;
    }

    /** Ask every host on the list (default: the phone's /24) for a TCP reply. Used when broadcast is filtered. */
    public static List<Reply> tcpSweep(List<String> hosts, final int port, final byte[] frame, final int timeoutMs, int threads) {
        if (hosts == null) hosts = subnetHosts();
        ExecutorService ex = Executors.newFixedThreadPool(Math.max(1, threads));
        List<Future<Reply>> futs = new ArrayList<Future<Reply>>();
        for (final String h : hosts) {
            futs.add(ex.submit(new Callable<Reply>() {
                public Reply call() {
                    try {
                        return new Reply(h, tcpRequest(h, port, frame, timeoutMs));
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
