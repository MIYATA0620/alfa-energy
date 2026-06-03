package com.yourapp; // ← CHANGE THIS to your actual package name

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

/**
 * MainActivity.java — Alfamart Energy Checklist APK
 *
 * WebView host that:
 *  1. Loads the Alfamart web app
 *  2. Injects AndroidBridge so JS can fire native notifications
 *  3. Requests POST_NOTIFICATIONS permission on Android 13+
 */
public class MainActivity extends AppCompatActivity {

    private static final int NOTIF_PERMISSION_CODE = 100;
    private WebView webView;

    // ── YOUR APP URL — change this ──
    private static final String APP_URL = "https://your-server.com";
    // For local HTML file bundled in APK assets:
    // private static final String APP_URL = "file:///android_asset/index.html";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webview);

        // ── WebView settings ──
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);       // JS must be on
        settings.setDomStorageEnabled(true);        // enables localStorage
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        // ── Inject the native bridge BEFORE loadUrl ──
        webView.addJavascriptInterface(new AndroidBridge(this), "Android");

        // ── Prevent links opening external browser ──
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                view.loadUrl(url);
                return true;
            }
        });

        // ── Request notification permission (Android 13+) ──
        requestNotificationPermission();

        // ── Load the app ──
        webView.loadUrl(APP_URL);
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(
                    this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(
                    this,
                    new String[]{ Manifest.permission.POST_NOTIFICATIONS },
                    NOTIF_PERMISSION_CODE
                );
            }
        }
    }

    // ── Hardware back button navigates WebView history ──
    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
