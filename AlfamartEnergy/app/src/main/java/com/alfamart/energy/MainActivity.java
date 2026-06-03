package com.alfamart.energy;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import java.io.File;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class MainActivity extends AppCompatActivity {

    private static final int REQ_PERMISSIONS  = 100;
    private static final int REQ_FILE_CHOOSER = 101;

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private Uri cameraImageUri;

    // ← Replace with your actual server IP and port
    private static final String APP_URL = "https://alfa-energy.onrender.com/";
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webview);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        webView.addJavascriptInterface(new AndroidBridge(this), "Android");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                view.loadUrl(url);
                return true;
            }
        });

        // THIS is what makes the camera/file picker work
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView wv,
                    ValueCallback<Uri[]> cb,
                    FileChooserParams params) {

                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = cb;
                openImageChooser();
                return true;
            }
        });

        requestPermissions();
        webView.loadUrl(APP_URL);
    }

    private void openImageChooser() {
        // Camera intent
        Intent cameraIntent = null;
        try {
            File f = createImageFile();
            cameraImageUri = FileProvider.getUriForFile(
                this,
                BuildConfig.APPLICATION_ID + ".provider",   // matches AndroidManifest
                f
            );
            cameraIntent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            cameraIntent.putExtra(MediaStore.EXTRA_OUTPUT, cameraImageUri);
        } catch (Exception e) {
            cameraImageUri = null;
        }

        // Gallery intent
        Intent galleryIntent = new Intent(Intent.ACTION_GET_CONTENT);
        galleryIntent.setType("image/*");

        Intent chooser = Intent.createChooser(galleryIntent, "Select Image");
        if (cameraIntent != null) {
            chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS,
                new Intent[]{ cameraIntent });
        }

        startActivityForResult(chooser, REQ_FILE_CHOOSER);
    }

    private File createImageFile() throws IOException {
        String stamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US)
                           .format(new Date());
        File dir = getExternalFilesDir(Environment.DIRECTORY_PICTURES);
        return File.createTempFile("IMG_" + stamp, ".jpg", dir);
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req != REQ_FILE_CHOOSER || filePathCallback == null) return;

        Uri[] result = null;
        if (res == Activity.RESULT_OK) {
            if (data == null || data.getData() == null) {
                // came from camera
                if (cameraImageUri != null) result = new Uri[]{ cameraImageUri };
            } else {
                result = new Uri[]{ data.getData() };
            }
        }
        filePathCallback.onReceiveValue(result);
        filePathCallback = null;
    }

    private void requestPermissions() {
        java.util.List<String> perms = new java.util.ArrayList<>();
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED)
            perms.add(Manifest.permission.CAMERA);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED)
            perms.add(Manifest.permission.POST_NOTIFICATIONS);
        if (!perms.isEmpty())
            ActivityCompat.requestPermissions(this,
                perms.toArray(new String[0]), REQ_PERMISSIONS);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
}
