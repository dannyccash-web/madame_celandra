package com.madamecelandra.app;

import android.util.Log;

import com.amazon.device.drm.LicensingListener;
import com.amazon.device.drm.LicensingService;
import com.amazon.device.drm.model.LicenseResponse;
import com.amazon.device.iap.PurchasingListener;
import com.amazon.device.iap.PurchasingService;
import com.amazon.device.iap.model.FulfillmentResult;
import com.amazon.device.iap.model.Product;
import com.amazon.device.iap.model.ProductDataResponse;
import com.amazon.device.iap.model.PurchaseResponse;
import com.amazon.device.iap.model.PurchaseUpdatesResponse;
import com.amazon.device.iap.model.Receipt;
import com.amazon.device.iap.model.RequestId;
import com.amazon.device.iap.model.UserData;
import com.amazon.device.iap.model.UserDataResponse;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Minimal Capacitor bridge to the Amazon Appstore SDK's In-App Purchasing API.
 *
 * JS usage (window.Capacitor.Plugins.AmazonIap):
 *   getUserData()                    → { userId, marketplace }
 *   getProductData({ skus: [...] })  → { products: { sku: { price, title } }, unavailableSkus: [...] }
 *   purchase({ sku })                → { status, receiptId?, sku?, userId? }
 *   getPurchaseUpdates({ reset })    → { userId, hasMore, receipts: [{ receiptId, sku, canceled }] }
 *   notifyFulfillment({ receiptId, result })   result = FULFILLED | UNAVAILABLE
 *   verifyLicense()                  → { status }  LICENSED | NOT_LICENSED | EXPIRED | ERROR_* | UNKNOWN_ERROR
 *
 * verifyLicense is Amazon DRM for apps that use the Appstore SDK (the console's
 * "apply DRM" switch isn't offered to them). It confirms this Amazon account
 * actually bought the app.
 */
@CapacitorPlugin(name = "AmazonIap")
public class AmazonIapPlugin extends Plugin implements PurchasingListener {

    private static final String TAG = "AmazonIap";

    // Amazon answers asynchronously via the listener; match replies to the
    // waiting JS call by request id.
    private final Map<String, PluginCall> pending = new ConcurrentHashMap<>();

    @Override
    public void load() {
        PurchasingService.registerListener(getContext().getApplicationContext(), this);
        Log.i(TAG, "Registered Amazon IAP listener, SDK " + PurchasingService.SDK_VERSION);
    }

    private void track(RequestId id, PluginCall call) {
        if (id == null) {
            call.reject("Amazon Appstore did not accept the request.");
            return;
        }
        pending.put(id.toString(), call);
    }

    private PluginCall take(RequestId id) {
        return id == null ? null : pending.remove(id.toString());
    }

    // ---------- JS methods ----------

    @PluginMethod
    public void getUserData(PluginCall call) {
        track(PurchasingService.getUserData(), call);
    }

    @PluginMethod
    public void getProductData(PluginCall call) {
        Set<String> skus = new HashSet<>();
        JSArray arr = call.getArray("skus");
        if (arr != null) {
            try {
                List<String> list = arr.toList();
                skus.addAll(list);
            } catch (JSONException e) {
                call.reject("`skus` must be an array of strings.");
                return;
            }
        }
        if (skus.isEmpty()) {
            call.reject("`skus` is required.");
            return;
        }
        track(PurchasingService.getProductData(skus), call);
    }

    @PluginMethod
    public void purchase(PluginCall call) {
        String sku = call.getString("sku");
        if (sku == null || sku.isEmpty()) {
            call.reject("`sku` is required.");
            return;
        }
        track(PurchasingService.purchase(sku), call);
    }

    @PluginMethod
    public void getPurchaseUpdates(PluginCall call) {
        boolean reset = Boolean.TRUE.equals(call.getBoolean("reset", false));
        track(PurchasingService.getPurchaseUpdates(reset), call);
    }

    @PluginMethod
    public void notifyFulfillment(PluginCall call) {
        String receiptId = call.getString("receiptId");
        String result = call.getString("result", "FULFILLED");
        if (receiptId == null || receiptId.isEmpty()) {
            call.reject("`receiptId` is required.");
            return;
        }
        FulfillmentResult fr;
        try {
            fr = FulfillmentResult.valueOf(result);
        } catch (IllegalArgumentException e) {
            call.reject("Unknown fulfillment result: " + result);
            return;
        }
        PurchasingService.notifyFulfillment(receiptId, fr);
        call.resolve();
    }

    @PluginMethod
    public void verifyLicense(PluginCall call) {
        try {
            LicensingService.verifyLicense(getContext().getApplicationContext(), new LicensingListener() {
                @Override
                public void onLicenseCommandResponse(LicenseResponse response) {
                    JSObject ret = new JSObject();
                    ret.put("status", String.valueOf(response.getRequestStatus()));
                    call.resolve(ret);
                }
            });
        } catch (Exception e) {
            JSObject ret = new JSObject();
            ret.put("status", "UNKNOWN_ERROR");
            ret.put("error", String.valueOf(e.getMessage()));
            call.resolve(ret);
        }
    }

    // ---------- Amazon listener callbacks ----------

    @Override
    public void onUserDataResponse(UserDataResponse response) {
        PluginCall call = take(response.getRequestId());
        if (call == null) return;
        String status = String.valueOf(response.getRequestStatus());
        UserData ud = response.getUserData();
        if ("SUCCESSFUL".equals(status) && ud != null) {
            JSObject ret = new JSObject();
            ret.put("userId", ud.getUserId());
            ret.put("marketplace", ud.getMarketplace());
            call.resolve(ret);
        } else {
            call.reject("getUserData " + status, status);
        }
    }

    @Override
    public void onProductDataResponse(ProductDataResponse response) {
        PluginCall call = take(response.getRequestId());
        if (call == null) return;
        String status = String.valueOf(response.getRequestStatus());
        if (!"SUCCESSFUL".equals(status)) {
            call.reject("getProductData " + status, status);
            return;
        }
        JSObject products = new JSObject();
        Map<String, Product> data = response.getProductData();
        if (data != null) {
            for (Map.Entry<String, Product> e : data.entrySet()) {
                Product p = e.getValue();
                JSObject o = new JSObject();
                o.put("sku", p.getSku());
                o.put("price", p.getPrice());
                o.put("title", p.getTitle());
                o.put("description", p.getDescription());
                products.put(e.getKey(), o);
            }
        }
        JSArray unavailable = new JSArray();
        Set<String> un = response.getUnavailableSkus();
        if (un != null) for (String s : un) unavailable.put(s);

        JSObject ret = new JSObject();
        ret.put("products", products);
        ret.put("unavailableSkus", unavailable);
        call.resolve(ret);
    }

    @Override
    public void onPurchaseResponse(PurchaseResponse response) {
        PluginCall call = take(response.getRequestId());
        if (call == null) return;
        // Statuses: SUCCESSFUL, FAILED, INVALID_SKU, ALREADY_PURCHASED, NOT_SUPPORTED, PENDING
        // Resolve (not reject) for all of them so JS can show the right message.
        JSObject ret = new JSObject();
        ret.put("status", String.valueOf(response.getRequestStatus()));
        Receipt r = response.getReceipt();
        if (r != null) {
            ret.put("receiptId", r.getReceiptId());
            ret.put("sku", r.getSku());
            ret.put("canceled", r.isCanceled());
        }
        UserData ud = response.getUserData();
        if (ud != null) ret.put("userId", ud.getUserId());
        call.resolve(ret);
    }

    @Override
    public void onPurchaseUpdatesResponse(PurchaseUpdatesResponse response) {
        PluginCall call = take(response.getRequestId());
        if (call == null) return;
        String status = String.valueOf(response.getRequestStatus());
        if (!"SUCCESSFUL".equals(status)) {
            call.reject("getPurchaseUpdates " + status, status);
            return;
        }
        JSArray receipts = new JSArray();
        List<Receipt> list = response.getReceipts();
        if (list != null) {
            for (Receipt r : list) {
                JSObject o = new JSObject();
                o.put("receiptId", r.getReceiptId());
                o.put("sku", r.getSku());
                o.put("canceled", r.isCanceled());
                receipts.put(o);
            }
        }
        JSObject ret = new JSObject();
        UserData ud = response.getUserData();
        if (ud != null) ret.put("userId", ud.getUserId());
        ret.put("hasMore", response.hasMore());
        ret.put("receipts", receipts);
        call.resolve(ret);
    }
}
