/**
 * api.js — Alfamart Energy Checklist
 * Alfamart Energy Monitoring System
 */

// ════════════════════════════════════════════════════════
// API
// ════════════════════════════════════════════════════════
async function apiFetch(method, path, body) {
  try {
    var opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-App-Token':  'alfamart-2026'   // ← required by server.js APP_TOKEN check
      }
    };
    if (body) opts.body = JSON.stringify(body);
    // Prepend /atp so every request matches the server's SITE_KEY prefix.
    // API is '' (same-origin), so the full URL becomes /atp/api/...
    var res = await fetch(API + '/atp' + path, opts);
    return await res.json();
  } catch(e) {
    document.getElementById('offline-bar2').textContent = '⚠ Server offline — working in offline mode. Submissions will sync when connected.';
    document.getElementById('offline-bar2').style.display='block';
    return null;
  }
}

async function syncDB() {
  var data = await apiFetch('GET', '/api/db');
  if (!data) { return; }
  try {
    document.getElementById('offline-bar2').style.display='none';
  } catch(e){}
  db = data;
  // Only render what's needed — never call initMobile on sync (it resets state)
  try { if(currentUser && currentUser.role !== 'crew') renderServer(); } catch(e){ console.warn('renderServer err',e); }
  try { if(currentUser && currentUser.role === 'crew') { hydrateLocalTasksFromServer(); renderMobileChecklist(); } } catch(e){}
  try { renderMobileStore(); } catch(e){}
  try { renderMobileHistory(); } catch(e){}
  try { renderMobileNotif(); } catch(e){}
}

function syncNow() { syncDB(); toast('🔄 Syncing...'); }

// Auto-poll every 5s
setInterval(syncDB, POLL_INTERVAL);

