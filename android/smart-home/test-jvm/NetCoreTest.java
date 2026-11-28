import com.paulaxisa.smarthome.NetCore;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;

/**
 * Plain-JVM test of the Android plugin's socket code (NetCore) against the Python mock HS110s.
 * Run via run-test.sh, which starts the mocks first. Cipher helpers here are a second, independent
 * implementation of the XOR autokey cipher (the app's copy is in smart-home/hs110.mjs).
 */
public class NetCoreTest {
    static int failed = 0;
    static void check(String name, boolean ok, String extra) {
        System.out.println((ok ? "PASS " : "FAIL ") + name + (ok ? "" : " " + extra));
        if (!ok) failed++;
    }

    static byte[] enc(String s) {
        byte[] src = s.getBytes(StandardCharsets.UTF_8), out = new byte[src.length];
        int key = 171;
        for (int i = 0; i < src.length; i++) { key ^= (src[i] & 0xff); out[i] = (byte) key; }
        return out;
    }
    static byte[] frame(String s) {
        byte[] b = enc(s);
        ByteBuffer bb = ByteBuffer.allocate(4 + b.length);
        bb.putInt(b.length); bb.put(b);
        return bb.array();
    }
    static String dec(byte[] c, int off) {
        byte[] out = new byte[c.length - off];
        int key = 171;
        for (int i = off; i < c.length; i++) { out[i - off] = (byte) (key ^ (c[i] & 0xff)); key = c[i] & 0xff; }
        return new String(out, StandardCharsets.UTF_8);
    }
    static String code(Runnable r) { return null; }

    interface Thrower { void run() throws Exception; }
    static String errCode(Thrower t) {
        try { t.run(); return "none"; }
        catch (NetCore.NetException e) { return e.code; }
        catch (Exception e) { return "other:" + e; }
    }

    public static void main(String[] a) throws Exception {
        final byte[] sys = frame("{\"system\":{\"get_sysinfo\":{}}}");
        byte[] r = NetCore.tcpRequest("127.0.0.2", 9999, sys, 2000);
        String t = dec(r, 4);
        check("hw1 sysinfo over TCP", t.contains("\"alias\": \"Mock 127.0.0.2\"") && t.contains("\"hw_ver\": \"1.0\""), t);
        t = dec(NetCore.tcpRequest("127.0.0.3", 9999, sys, 2000), 4);
        check("hw2 sysinfo over TCP", t.contains("\"hw_ver\": \"2.0\""), t);

        t = dec(NetCore.tcpRequest("127.0.0.3", 9999, frame("{\"emeter\":{\"get_realtime\":{}}}"), 2000), 4);
        check("hw2 realtime uses power_mw", t.contains("power_mw") && t.contains("voltage_mv"), t);
        t = dec(NetCore.tcpRequest("127.0.0.2", 9999, frame("{\"emeter\":{\"get_realtime\":{}}}"), 2000), 4);
        check("hw1 realtime uses power", t.contains("\"power\"") && !t.contains("power_mw"), t);

        t = dec(NetCore.tcpRequest("127.0.0.2", 9999, frame("{\"system\":{\"set_relay_state\":{\"state\":0}}}"), 2000), 4);
        check("set_relay_state reply", t.contains("\"err_code\": 0"), t);
        t = dec(NetCore.tcpRequest("127.0.0.2", 9999, sys, 2000), 4);
        check("relay is now off", t.contains("\"relay_state\": 0"), t);
        NetCore.tcpRequest("127.0.0.2", 9999, frame("{\"system\":{\"set_relay_state\":{\"state\":1}}}"), 2000);

        t = dec(NetCore.tcpRequest("127.0.0.4", 9999, sys, 3000), 4);
        check("reply sent in 7-byte chunks is reassembled", t.contains("Mock 127.0.0.4"), t);

        check("hang-up -> closed", "closed".equals(errCode(() -> NetCore.tcpRequest("127.0.0.5", 9999, sys, 2000))), "");
        long t0 = System.currentTimeMillis();
        String c = errCode(() -> NetCore.tcpRequest("127.0.0.6", 9999, sys, 700));
        long dt = System.currentTimeMillis() - t0;
        check("silent plug -> timeout in about the timeout", "timeout".equals(c) && dt < 1500, c + " " + dt + "ms");
        check("nothing listening -> refused", "refused".equals(errCode(() -> NetCore.tcpRequest("127.0.0.7", 9999, sys, 2000))), "");

        List<NetCore.Reply> sweep = NetCore.tcpSweep(Arrays.asList("127.0.0.2", "127.0.0.3", "127.0.0.5", "127.0.0.7"), 9999, sys, 700, 8);
        check("tcpSweep finds the two talking plugs", sweep.size() == 2, String.valueOf(sweep.size()));

        // UDP: mock listening on 0.0.0.0:9999 (127.0.0.1 also reachable); send to explicit unicast + broadcast addresses
        List<NetCore.Reply> udp = NetCore.udpDiscover(enc("{\"system\":{\"get_sysinfo\":{}}}"), 9999, 1200);
        StringBuilder hosts = new StringBuilder();
        for (NetCore.Reply x : udp) hosts.append(x.host).append(' ');
        check("udpDiscover broadcast reaches a listening plug (" + hosts.toString().trim() + ")", udp.size() >= 1 && dec(udp.get(0).data, 0).contains("alias"), hosts.toString());

        System.out.println("local IPv4: " + NetCore.localIPv4() + ", sweep hosts: " + NetCore.subnetHosts().size());
        System.out.println(failed == 0 ? "ALL PASSED" : failed + " FAILED");
        System.exit(failed == 0 ? 0 : 1);
    }
}
