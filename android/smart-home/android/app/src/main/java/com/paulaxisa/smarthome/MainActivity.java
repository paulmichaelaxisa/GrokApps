package com.paulaxisa.smarthome;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Raw TCP/UDP for TP-Link Kasa devices (a WebView can't open sockets)
        registerPlugin(SmartNetPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
