/**
 * notifications.js — Alfamart Energy Checklist
 * Alfamart Energy Monitoring System
 *
 * Supports:
 *   • Android APK  → real system notification via window.Android bridge
 *   • Browser      → in-app popup window (existing behaviour, unchanged)
 */

// ════════════════════════════════════════════════════════
// DETECT ENVIRONMENT
// ════════════════════════════════════════════════════════
// true when running inside the Android APK (AndroidBridge injected by MainActivity)
var IS_ANDROID_APP = (function() {
  try { return typeof window.Android !== 'undefined' && !!window.Android.isAndroidApp(); }
  catch(e) { return false; }
})();

// ════════════════════════════════════════════════════════
// CORE — SEND TO ONE STORE
// ════════════════════════════════════════════════════════
async function sendNotif(storeId, storeName) {
  var title   = '🔔 Checklist Reminder';
  var message = 'Please complete your energy checklist for ' + storeName + ' shift. Attach photos as proof.';

  // Always persist to server so other sessions/devices see it
  await apiFetch('POST', '/api/notify', { storeId, storeName, message });
  await syncDB();

  // Deliver notification
  _deliverNotification(title, message, storeName);
  toast('🔔 Notification sent to ' + storeName);
}

// ════════════════════════════════════════════════════════
// CORE — NOTIFY ALL STORES
// ════════════════════════════════════════════════════════
async function notifyAll() {
  var stores = db.stores || [];
  for (var i = 0; i < stores.length; i++) {
    var s   = stores[i];
    var msg = 'Shift checklist reminder for ' + s.name + '. Please complete and attach photos.';
    await apiFetch('POST', '/api/notify', { storeId: s.id, storeName: s.name, message: msg });

    if (IS_ANDROID_APP) {
      // Stagger each notification by 400ms so they land as separate entries
      await new Promise(function(r) { setTimeout(r, 400); });
      try { window.Android.showNotification('📢 Checklist Reminder — ' + s.name, msg); } catch(e) {}
    }
  }
  await syncDB();

  if (!IS_ANDROID_APP) {
    // Browser: show a single combined popup
    _showInAppPopup('📢 All Stores Notified', 'Checklist reminder sent to all ' + stores.length + ' stores.', 'All Stores');
  }
  toast('📢 All stores notified!');
}

// ════════════════════════════════════════════════════════
// DELIVERY ROUTER
// ════════════════════════════════════════════════════════
function _deliverNotification(title, message, storeName) {
  if (IS_ANDROID_APP) {
    // ✅ APK path — native Android system notification
    try {
      window.Android.showNotification(title, message);
      return;
    } catch(e) {
      console.warn('[notifications] Android bridge failed, falling back to popup:', e);
    }
  }
  // 🌐 Browser path (or APK bridge failed) — in-app popup
  _showInAppPopup(title, message, storeName);
}

// ════════════════════════════════════════════════════════
// IN-APP POPUP (browser fallback — uses existing popup HTML/CSS)
// ════════════════════════════════════════════════════════
function _showInAppPopup(title, message, storeName) {
  var overlay = document.getElementById('notif-overlay');
  if (!overlay) return;

  var titleEl = document.getElementById('popup-title');
  var storeEl = document.getElementById('popup-store');
  var msgEl   = document.getElementById('popup-msg');
  var timeEl  = document.getElementById('popup-time');

  if (titleEl) titleEl.textContent = title;
  if (storeEl) storeEl.textContent = storeName || '';
  if (msgEl)   msgEl.textContent   = message;
  if (timeEl)  timeEl.textContent  = 'Received: ' + new Date().toLocaleTimeString('en-PH', {
    hour: '2-digit', minute: '2-digit'
  }) + ', ' + new Date().toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });

  overlay.classList.add('show');
}

// ════════════════════════════════════════════════════════
// POPUP CONTROLS (called by popup HTML buttons)
// ════════════════════════════════════════════════════════
function closeNotifPopup() {
  var overlay = document.getElementById('notif-overlay');
  if (overlay) overlay.classList.remove('show');
}

function goToChecklist() {
  closeNotifPopup();
  try { mNav('checklist'); } catch(e) {}
}
