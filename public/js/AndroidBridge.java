package com.yourapp; // ← CHANGE THIS to your actual package name
// e.g. package com.alfamart.energychecklist;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.webkit.JavascriptInterface;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/**
 * AndroidBridge.java — Alfamart Energy Checklist APK
 *
 * Injected into WebView via:
 *   webView.addJavascriptInterface(new AndroidBridge(this), "Android");
 *
 * Callable from JavaScript as:
 *   window.Android.showNotification("title", "message")
 *   window.Android.isAndroidApp()
 */
public class AndroidBridge {

    private static final String CHANNEL_ID   = "alfamart_checklist";
    private static final String CHANNEL_NAME = "Alfamart Checklist Reminders";
    private static final int    BASE_NOTIF_ID = 2000;

    private final Context context;
    private int notifId = BASE_NOTIF_ID;

    public AndroidBridge(Context context) {
        this.context = context;
        createNotificationChannel();
    }

    /**
     * Called from JavaScript: window.Android.showNotification(title, message)
     * Fires a real Android system notification visible in the status bar.
     */
    @JavascriptInterface
    public void showNotification(String title, String message) {
        // Tap notification → open app
        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        PendingIntent pendingIntent = PendingIntent.getActivity(
            context,
            notifId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)     // white monochrome icon
            .setContentTitle(title)
            .setContentText(message)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(message)) // expandable
            .setPriority(NotificationCompat.PRIORITY_HIGH)  // shows as heads-up banner
            .setAutoCancel(true)                            // dismiss on tap
            .setContentIntent(pendingIntent);

        try {
            NotificationManagerCompat manager = NotificationManagerCompat.from(context);
            manager.notify(notifId++, builder.build());
        } catch (SecurityException e) {
            // POST_NOTIFICATIONS permission not granted (Android 13+)
            e.printStackTrace();
        }
    }

    /**
     * Called from JavaScript: window.Android.isAndroidApp()
     * Returns true so the web code knows it's inside the APK.
     */
    @JavascriptInterface
    public boolean isAndroidApp() {
        return true;
    }

    /**
     * Create the notification channel (required on Android 8.0 / API 26+).
     * Safe to call multiple times — Android ignores duplicates.
     */
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH  // shows banner + sound
            );
            channel.setDescription("Store checklist shift reminders from Alfamart managers");
            channel.enableVibration(true);

            NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }
}
