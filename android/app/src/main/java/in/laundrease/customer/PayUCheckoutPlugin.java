package in.laundrease.customer;

import android.app.Activity;
import android.webkit.WebView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.payu.base.models.ErrorResponse;
import com.payu.checkoutpro.PayUCheckoutPro;
import com.payu.checkoutpro.parser.CheckoutProCallbackToJSONParser;
import com.payu.ui.model.listeners.PayUCheckoutProListener;
import com.payu.ui.model.listeners.PayUHashGenerationListener;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;

/**
 * Native PayU CheckoutPro sheet, bridged to the web layer.
 *
 * Why this file exists rather than PayU's own Cordova plugin: this app loads a
 * remote URL (server.url in capacitor.config.ts), and Cordova plugin JS is
 * injected from local app assets, which never happens for a remotely loaded
 * page. A Capacitor plugin has no such problem, because registerPlugin() on the
 * JS side talks to the injected native bridge by plugin name.
 *
 * The interesting part is the hash round trip. The SDK will not proceed without
 * hashes signed by the merchant salt, and that salt must never reach the
 * device. So each time the SDK asks for one, this plugin forwards the request
 * to the web layer as a payuHashRequired event; the web layer asks the server,
 * and returns the result via provideHash(). The salt stays on the server, and
 * the WebView's own session cookie authenticates the request, which is
 * precisely why the round trip goes through JS rather than being made here.
 */
@CapacitorPlugin(name = "PayUCheckout")
public class PayUCheckoutPlugin extends Plugin {

    private CheckoutProCallbackToJSONParser responseTransformer;

    /**
     * The in-flight openCheckout() call. Held open across the whole payment,
     * since the SDK reports back long after the method returns, and resolved
     * once, on the first terminal outcome.
     */
    private PluginCall pendingCall;

    @PluginMethod
    public void openCheckout(final PluginCall call) {
        JSObject params = call.getObject("params");
        if (params == null) {
            call.reject("Missing payment params");
            return;
        }

        final HashMap<String, Object> paymentParams;
        try {
            paymentParams = toMap(params);
        } catch (JSONException e) {
            call.reject("Could not read payment params: " + e.getMessage());
            return;
        }

        // Kept alive so the listener below can emit hash requests before the
        // single terminal resolve.
        call.setKeepAlive(true);
        pendingCall = call;

        final Activity activity = getActivity();
        activity.runOnUiThread(() -> {
            responseTransformer = new CheckoutProCallbackToJSONParser();
            PayUCheckoutPro.open(activity, paymentParams, new PayUCheckoutProListener() {
                @Override
                public void onPaymentSuccess(@NonNull Object response) {
                    // Success here means the SDK's view of the payment. It is
                    // not proof of payment: the server re-checks with PayU
                    // before anything is marked paid. See
                    // app/api/customer/payments/payu/sdk-result/route.ts.
                    finish("success", String.valueOf(responseTransformer.onPaymentSuccess(response)));
                }

                @Override
                public void onPaymentFailure(@NonNull Object response) {
                    finish("failure", String.valueOf(responseTransformer.onPaymentFailure(response)));
                }

                @Override
                public void onPaymentCancel(boolean isTxnInitiated) {
                    // isTxnInitiated true means money may already be moving, so
                    // the web layer must verify rather than assume nothing
                    // happened.
                    JSObject result = new JSObject();
                    result.put("event", "cancel");
                    result.put("isTxnInitiated", isTxnInitiated);
                    resolveOnce(result);
                }

                @Override
                public void onError(@NonNull ErrorResponse errorResponse) {
                    JSObject result = new JSObject();
                    result.put("event", "error");
                    result.put("errorCode", errorResponse.getErrorCode());
                    result.put("errorMessage", errorResponse.getErrorMessage());
                    resolveOnce(result);
                }

                @Override
                public void generateHash(
                    @NonNull HashMap<String, String> hashMap,
                    @NonNull PayUHashGenerationListener listener
                ) {
                    // The parser stashes the listener for the matching
                    // provideHash() call and hands back the request to forward.
                    HashMap<String, String> request = responseTransformer.generateHash(hashMap, listener);
                    JSObject event = new JSObject();
                    for (String key : request.keySet()) {
                        event.put(key, request.get(key));
                    }
                    notifyListeners("payuHashRequired", event);
                }

                @Override
                public void setWebViewProperties(@Nullable WebView webView, @Nullable Object o) {
                    // Nothing to customise. The SDK renders its own views.
                }
            });
        });
    }

    /**
     * Hand a server-computed hash back to the waiting SDK.
     *
     * Expects hashName and hash; the SDK wants those as a single-entry map
     * keyed by the hash's own name.
     */
    @PluginMethod
    public void provideHash(final PluginCall call) {
        final String hashName = call.getString("hashName");
        final String hash = call.getString("hash");

        if (hashName == null || hash == null) {
            call.reject("provideHash requires hashName and hash");
            return;
        }
        if (responseTransformer == null) {
            call.reject("No checkout in progress");
            return;
        }

        final HashMap<String, String> reply = new HashMap<>();
        reply.put(hashName, hash);

        final Activity activity = getActivity();
        activity.runOnUiThread(() -> {
            responseTransformer.hashGenerated(activity, reply, error -> {
                // A rejected hash aborts the payment, so it has to surface on
                // the checkout call rather than only on this one.
                JSObject result = new JSObject();
                result.put("event", "error");
                result.put("errorCode", error != null ? error.getErrorCode() : null);
                result.put(
                    "errorMessage",
                    error != null ? error.getErrorMessage() : "Hash was rejected by the payment SDK"
                );
                resolveOnce(result);
                return null;
            });
            call.resolve();
        });
    }

    private void finish(String event, String payload) {
        JSObject result = new JSObject();
        result.put("event", event);
        result.put("payload", payload);
        resolveOnce(result);
    }

    /**
     * The SDK can emit more than one terminal callback (an error arriving after
     * a cancel, say). Only the first wins: resolving a consumed call would
     * throw, and the web layer must see one outcome, not a race.
     */
    private synchronized void resolveOnce(JSObject result) {
        if (pendingCall == null) return;
        PluginCall call = pendingCall;
        pendingCall = null;
        call.setKeepAlive(false);
        call.resolve(result);
    }

    private static HashMap<String, Object> toMap(JSONObject object) throws JSONException {
        HashMap<String, Object> map = new HashMap<>();
        Iterator<String> keys = object.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            Object value = object.get(key);
            if (value instanceof JSONArray) {
                value = toList((JSONArray) value);
            } else if (value instanceof JSONObject) {
                value = toMap((JSONObject) value);
            }
            map.put(key, value);
        }
        return map;
    }

    private static List<Object> toList(JSONArray array) throws JSONException {
        List<Object> list = new ArrayList<>();
        for (int i = 0; i < array.length(); i++) {
            Object value = array.get(i);
            if (value instanceof JSONArray) {
                value = toList((JSONArray) value);
            } else if (value instanceof JSONObject) {
                value = toMap((JSONObject) value);
            }
            list.add(value);
        }
        return list;
    }
}
