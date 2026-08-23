package in.laundrease.customer;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins that live in the app module are not auto-discovered the way
        // ones from node_modules are, so this registration is what makes
        // Capacitor.Plugins.PayUCheckout resolve on the JS side. It must run
        // before super.onCreate(), which is where the bridge is built.
        registerPlugin(PayUCheckoutPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
