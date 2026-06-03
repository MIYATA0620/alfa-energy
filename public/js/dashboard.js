/**
 * dashboard.js — Alfamart Energy Checklist
 * Alfamart Energy Monitoring System
 */

// ════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════
function hydrateLocalTasksFromServer() {
  if (!currentUser || !currentUser.storeId) return;
  var storeId = currentUser.storeId;
  var now = new Date();
  var cutoff = new Date(now);
  if (now.getHours() < 5) cutoff.setDate(cutoff.getDate() - 1);
  cutoff.setHours(5, 0, 0, 0);
  var subs = (db.submissions || []).filter(function(s) {
    return s.storeId === storeId && new Date(s.submittedAt) >= cutoff;
  });
  subs.forEach(function(s) {
    var lt = localTasks[s.taskId] || {};
    lt.done = true;
    if (!lt.status) lt.status = s.status || 'yes';
    if (!lt.remark && s.remark) lt.remark = s.remark;
    localTasks[s.taskId] = lt;
  });
  if (subs.length) saveLocalTasks();
}

function storeProgress(storeId) {
  var now = new Date();
  var cutoff = new Date(now);
  if (now.getHours() < 5) cutoff.setDate(cutoff.getDate() - 1);
  cutoff.setHours(5, 0, 0, 0);
  var subs = (db.submissions || []).filter(function(s) { return s.storeId === storeId && new Date(s.submittedAt) >= cutoff; });
  var seen = {}; subs.forEach(function(s) { seen[s.taskId] = true; });
  var total = CHECKLIST.reduce(function(a, c) { return a + c.tasks.length; }, 0);
  return total > 0 ? Math.round((Object.keys(seen).length / total) * 100) : 0;
}

function isTaskApproved(taskId) {
  if (!currentUser || !currentUser.storeId) return false;
  var now = new Date();
  var cutoff = new Date(now);
  if (now.getHours() < 5) { cutoff.setDate(cutoff.getDate() - 1); }
  cutoff.setHours(5, 0, 0, 0);
  return (db.submissions || []).some(function(s) {
    return s.storeId === currentUser.storeId && s.taskId === taskId && s.approved && new Date(s.submittedAt) >= cutoff;
  });
}

// ════════════════════════════════════════════════════════
// RENDER SERVER
// ════════════════════════════════════════════════════════
function renderServer() {
  if (!currentUser || currentUser.role === 'crew') return;
  // Only rebuild compliance toolbar if it hasn't been built yet (preserves focus on search input)
  // To force a rebuild call: document.getElementById('compliance-toolbar').removeAttribute('data-built')
  renderStoreSidebar();
  if (selectedStoreId) {
    renderStoreDetail(selectedStoreId);
  } else {
    renderStats();
    renderCrewTable();
    renderCompliancePanel();
    renderFeed();
    renderTempLogs();
    renderAlerts();
    renderEnergySummary();
  }
}

// ════════════════════════════════════════════════════════
// STATS
// ════════════════════════════════════════════════════════
function renderStats() {
  var total = db.submissions ? db.submissions.length : 0;
  var pending = db.submissions ? db.submissions.filter(function(s) { return !s.approved; }).length : 0;
  var allTotal = CHECKLIST.reduce(function(a, c) { return a + c.tasks.length; }, 0) * (db.stores ? db.stores.length : 1);
  var pct = allTotal > 0 ? Math.round((total / allTotal) * 100) : 0;
  document.getElementById('s-stores').textContent = (db.stores || []).length;
  document.getElementById('s-progress').textContent = pct + '%';
  document.getElementById('s-tasks').textContent = total;
  document.getElementById('s-pending').textContent = pending;
}

// ════════════════════════════════════════════════════════
// CREW TABLE
// ════════════════════════════════════════════════════════
function renderCrewTable() {
  var html = '';
  (db.stores || []).forEach(function(s) {
    var pct = storeProgress(s.id);
    var color = pct >= 100 ? 'var(--green)' : pct >= 50 ? 'var(--amber)' : 'var(--red)';
    var pillCls = pct >= 100 ? 'pill-green' : pct >= 50 ? 'pill-amber' : 'pill-red';
    var pillTxt = pct >= 100 ? '✓ Complete' : pct >= 50 ? 'In Progress' : 'Pending';
    html += '<tr>';
    html += '<td><span class="pill pill-blue">' + (s.storeNo || '—') + '</span></td>';
    html += '<td><b style="font-size:13px">' + s.name + '</b></td>';
    html += '<td><span class="pill pill-blue">' + (s.storeStatus || 'Opening') + '</span></td>';
    html += '<td><div class="prog-wrap"><div class="prog-bar"><div class="prog-fill" style="width:' + pct + '%;background:' + color + '"></div></div><span class="prog-val">' + pct + '%</span></div></td>';
    html += '<td><span class="pill ' + pillCls + '">' + pillTxt + '</span></td>';
    html += '<td><button class="notif-btn" onclick="event.stopPropagation();sendNotif(\'' + s.id + '\',\'' + s.name + '\')">🔔 Remind</button> <button class="notif-btn" style="background:var(--blue-bg);color:var(--blue);border-color:var(--blue-b)" onclick="selectStore(\'' + s.id + '\')">📊 View</button></td>';
    html += '</tr>';
  });
  document.getElementById('crew-body').innerHTML = html;
}

// ════════════════════════════════════════════════════════
// FEED (pending submissions + collapsible approved history)
// ════════════════════════════════════════════════════════
var _approvedHistoryOpen = false;
var _feedRenderScheduled = false;

function toggleApprovedHistory() {
  _approvedHistoryOpen = !_approvedHistoryOpen;
  _renderFeedCards();
}

// Only re-render the cards portion (not the section titles/badges) to avoid
// destroying the toggle header element while a click is in progress
function _renderFeedCards() {
  var subs = (db.submissions || []).slice().reverse();
  var pending = subs.filter(function(s) { return !s.approved; });
  var approved = subs.filter(function(s) { return s.approved; });

  // Pending count badge
  var pb = document.getElementById('pending-count-badge');
  if (pb) {
    if (pending.length > 0) {
      pb.textContent = pending.length;
      pb.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;background:var(--red);color:#fff;font-size:10px;font-weight:700;border-radius:9px;padding:0 5px;margin-left:6px;vertical-align:middle';
    } else { pb.textContent = ''; pb.style.cssText = ''; }
  }

  // Approved count badge
  var ab = document.getElementById('approved-count-badge');
  if (ab) {
    if (approved.length > 0) {
      ab.textContent = approved.length;
      ab.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;background:var(--green);color:#fff;font-size:10px;font-weight:700;border-radius:9px;padding:0 5px;margin-left:6px;vertical-align:middle';
    } else { ab.textContent = ''; ab.style.cssText = ''; }
  }

  // Pending feed
  var feedBox = document.getElementById('feed-box');
  if (feedBox) {
    var feedHtml = pending.length === 0
      ? '<div class="sub-empty">No pending submissions.</div>'
      : pending.map(function(s) { return buildSubCard(s, true); }).join('');
    feedBox.innerHTML = feedHtml;
  }

  // Approved history — render into a stable inner container so the outer
  // sec-title element (with the clickable badge) is never replaced
  var hist = document.getElementById('approved-history-box');
  if (!hist) return;

  // Ensure stable toggle-header div exists inside hist
  var toggler = document.getElementById('approved-toggle-btn');
  if (!toggler) {
    hist.innerHTML =
      '<div id="approved-toggle-btn" style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--rs);cursor:pointer;user-select:none;transition:background 0.15s" onmouseover="this.style.background=\'var(--bg4)\'" onmouseout="this.style.background=\'var(--bg3)\'">' +
        '<span style="font-size:13px;font-weight:600;flex:1">Approved submissions</span>' +
        '<span id="approved-toggle-count" style=""></span>' +
        '<span id="approved-toggle-arrow" style="font-size:12px;color:var(--text3);margin-left:4px;display:inline-block;transition:transform 0.2s">▶</span>' +
      '</div>' +
      '<div id="approved-cards-wrap"></div>';
    document.getElementById('approved-toggle-btn').addEventListener('click', function() {
      toggleApprovedHistory();
    });
    toggler = document.getElementById('approved-toggle-btn');
  }

  // Update count badge inside toggler
  var countEl = document.getElementById('approved-toggle-count');
  if (countEl) {
    if (approved.length > 0) {
      countEl.innerHTML = '<span style="display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;background:var(--green);color:#fff;font-size:10px;font-weight:700;border-radius:10px;padding:0 6px">' + approved.length + '</span>';
    } else {
      countEl.innerHTML = '<span style="font-size:11px;color:var(--text3)">None</span>';
    }
  }

  // Update arrow
  var arrowEl = document.getElementById('approved-toggle-arrow');
  if (arrowEl) arrowEl.style.transform = 'rotate(' + (_approvedHistoryOpen ? '90' : '0') + 'deg)';

  // Update cards
  var cardsWrap = document.getElementById('approved-cards-wrap');
  if (cardsWrap) {
    if (_approvedHistoryOpen) {
      cardsWrap.style.marginTop = '8px';
      cardsWrap.innerHTML = approved.length === 0
        ? '<div class="sub-empty">No approved submissions yet.</div>'
        : approved.map(function(s) { return buildSubCard(s, false); }).join('');
    } else {
      cardsWrap.style.marginTop = '0';
      cardsWrap.innerHTML = '';
    }
  }
}

function buildSubCard(s, showApproveBtn) {
  var init = (s.crew || '').split(' ').map(function(w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
  var ts = new Date(s.submittedAt).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
  var ds = new Date(s.submittedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
  var h = '';
  h += '<div class="sub-card ' + (s.approved ? 'sub-card-approved' : 'sub-card-pending') + '">';
  h += '<div class="sub-card-header">';
  h += '<div class="sub-av ' + (s.approved ? 'sub-av-approved' : 'sub-av-pending') + '">' + (s.approved ? '✓' : init) + '</div>';
  h += '<div class="sub-info"><div class="sub-crew">' + (s.crew || '—') + '</div><div class="sub-store">' + (s.storeName || '') + '</div></div>';
  h += '<div class="sub-time"><div class="sub-ts">' + ts + '</div><div class="sub-date">' + ds + '</div></div>';
  h += '</div>';
  h += '<div class="sub-task">' + (s.taskName || '') + '</div>';
  if (s.remark) h += '<div class="sub-remark">"' + s.remark + '"</div>';
  if (s.photos && s.photos.length) {
    h += '<div class="sub-photos">';
    s.photos.forEach(function(p) { h += '<img class="sub-photo" src="' + p + '" onclick="openLightbox(\'' + p + '\')" alt="proof">'; });
    h += '</div>';
  }
  h += '<div class="sub-footer">';
  h += '<span class="sub-badge ' + (s.approved ? 'sub-badge-approved' : 'sub-badge-pending') + '">' + (s.approved ? '✅ Approved' : '⏳ Pending') + '</span>';
  if (showApproveBtn && !s.approved && currentUser && currentUser.role === 'manager') {
    h += '<button class="sub-approve-btn" onclick="approve(\'' + s.id + '\')">✓ Approve</button>';
  }
  h += '</div></div>';
  return h;
}

function renderFeed() {
  _renderFeedCards();
}

// ════════════════════════════════════════════════════════
// TEMP LOGS (store search filter)
// ════════════════════════════════════════════════════════
var _tempLogStoreFilter = '';

function renderTempLogs() {
  var wrap = document.getElementById('temp-log-wrap');
  if (!wrap) return;

  var stores = db.stores || [];
  var allLogs = db.tempLogs || [];

  // Build search bar + results
  var html = '<div style="margin-bottom:10px">';
  html += '<input id="temp-log-search" type="text" placeholder="🔍 Search store name or number…"';
  html += ' value="' + (_tempLogStoreFilter || '').replace(/"/g, '&quot;') + '"';
  html += ' oninput="setTempLogFilter(this.value)"';
  html += ' style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--rs);padding:8px 12px;font-size:12px;color:var(--text);outline:none;font-family:var(--font);transition:border-color 0.15s"';
  html += ' onfocus="this.style.borderColor=\'var(--red)\'" onblur="this.style.borderColor=\'var(--border)\'">';
  html += '</div>';

  if (!_tempLogStoreFilter) {
    html += '<div style="padding:16px;text-align:center;color:var(--text3);font-size:12px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--rs)">Search a store above to view its temperature logs.</div>';
    wrap.innerHTML = html;
    return;
  }

  var q = _tempLogStoreFilter.toLowerCase();
  var matchedStores = stores.filter(function(s) {
    return s.name.toLowerCase().indexOf(q) !== -1 || (s.storeNo || '').toLowerCase().indexOf(q) !== -1;
  });

  if (!matchedStores.length) {
    html += '<div style="padding:16px;text-align:center;color:var(--text3);font-size:12px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--rs)">No stores match "' + _tempLogStoreFilter + '".</div>';
    wrap.innerHTML = html;
    return;
  }

  // For each matched store, show its logs
  matchedStores.forEach(function(s) {
    var logs = allLogs.filter(function(l) { return l.storeId === s.id; }).slice().reverse().slice(0, 20);
    html += '<div style="margin-bottom:14px">';
    html += '<div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:6px;padding:7px 10px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--rs);display:flex;align-items:center;gap:8px">';
    html += '<span style="background:var(--red);color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:6px">' + (s.storeNo || 'N/A') + '</span>';
    html += s.name;
    html += '<span style="margin-left:auto;font-size:11px;color:var(--text3)">' + logs.length + ' log' + (logs.length !== 1 ? 's' : '') + '</span>';
    html += '</div>';
    if (logs.length === 0) {
      html += '<div style="padding:12px;text-align:center;color:var(--text3);font-size:12px;border:1px solid var(--border);border-radius:var(--rs)">No temperature logs yet.</div>';
    } else {
      html += '<table class="temp-table"><thead><tr><th>Shift</th><th>Crew</th><th>Readings</th><th>Time</th></tr></thead><tbody>';
      logs.forEach(function(l) {
        var ts = new Date(l.submittedAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        var readings = Object.keys(l.readings || {}).length;
        html += '<tr><td>' + (l.shift || '—') + '</td><td>' + (l.crew || '—') + '</td>';
        html += '<td class="temp-ok">' + readings + ' readings</td>';
        html += '<td>' + ts + '</td></tr>';
      });
      html += '</tbody></table>';
    }
    html += '</div>';
  });

  wrap.innerHTML = html;

  // Restore focus + cursor position after innerHTML replace
  var inp = document.getElementById('temp-log-search');
  if (inp && document.activeElement !== inp) {
    try { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); } catch(e) {}
  }
}

function setTempLogFilter(val) {
  _tempLogStoreFilter = val || '';
  renderTempLogs();
}

// ════════════════════════════════════════════════════════
// ALERTS
// ════════════════════════════════════════════════════════
var _alertsOpen = true;
var _ackedAlerts = {};   // id → true (client-side ack until next full page load)

function toggleAlerts() {
  _alertsOpen = !_alertsOpen;
  renderAlerts();
}

function renderAlerts() {
  // ── section header (replaces the static sec-title in HTML) ──
  var header = document.getElementById('alerts-header');
  var box    = document.getElementById('alerts-box');
  if (!header || !box) return;

  var allNotifs = (db.notifications || []).filter(function(n) { return !n.read; });
  var notifs    = allNotifs.slice(-20).reverse();   // show up to 20 unread
  var unacked   = notifs.filter(function(n) { return !_ackedAlerts[n.id]; });
  var count     = unacked.length;

  // ── rebuild header ──
  var arrowStyle = 'display:inline-block;transition:transform 0.2s;font-size:11px;color:var(--text3)';
  var arrowRot   = _alertsOpen ? 'rotate(90deg)' : 'rotate(0deg)';
  var countBadge = count > 0
    ? '<span style="display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;background:var(--red);color:#fff;font-size:10px;font-weight:700;border-radius:9px;padding:0 5px;margin-left:6px;vertical-align:middle">' + count + '</span>'
    : '';
  var ackAllBtn = (count > 0 && _alertsOpen)
    ? '<button onclick="ackAllAlerts(event)" style="margin-left:auto;padding:3px 10px;border:1px solid var(--border2);border-radius:6px;background:var(--bg3);color:var(--text3);font-size:10px;font-weight:600;cursor:pointer;font-family:var(--font);transition:all 0.15s" onmouseover="this.style.background=\'var(--bg4)\'" onmouseout="this.style.background=\'var(--bg3)\'">Ack All</button>'
    : '';

  header.innerHTML =
    '<div onclick="toggleAlerts()" style="display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none;flex:1">' +
      '<span style="' + arrowStyle + ';transform:' + arrowRot + '">▶</span>' +
      '<span>⚠ Alerts</span>' +
      countBadge +
    '</div>' +
    ackAllBtn;

  // ── rebuild body ──
  if (!_alertsOpen) {
    box.style.display = 'none';
    return;
  }
  box.style.display = 'block';

  if (notifs.length === 0) {
    box.innerHTML = '<div style="padding:12px 14px;font-size:12px;color:var(--text3);background:var(--bg2);border:1px solid var(--border);border-radius:var(--rs);margin-bottom:16px">No active alerts.</div>';
    return;
  }

  var html = '';
  notifs.forEach(function(n) {
    var ts     = new Date(n.sentAt).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
    var isAcked = !!_ackedAlerts[n.id];
    html += '<div class="alert-card info" id="alert-' + n.id + '" style="' + (isAcked ? 'opacity:0.35;' : '') + '">';
    html += '<div class="alert-icon">📤</div>';
    html += '<div class="alert-body"><div class="alert-title">' + n.message + '</div>';
    html += '<div class="alert-sub">Sent to ' + n.storeName + '</div></div>';
    html += '<div class="alert-time">' + ts + '</div>';
    if (!isAcked) {
      html += '<button class="ack-btn" onclick="ackAlert(this,\'' + n.id + '\')">Ack</button>';
    } else {
      html += '<span style="font-size:10px;color:var(--text3);padding:4px 6px">✓ Acked</span>';
    }
    html += '</div>';
  });
  box.innerHTML = html;
}

async function approve(id) {
  var data = await apiFetch('POST', '/api/approve', { id });
  if (data && data.ok) { await syncDB(); toast('✅ Task approved!'); }
}

function ackAlert(btn, id) {
  _ackedAlerts[id] = true;
  renderAlerts();
}

function ackAllAlerts(e) {
  if (e) e.stopPropagation();
  var notifs = (db.notifications || []).filter(function(n) { return !n.read; });
  notifs.forEach(function(n) { _ackedAlerts[n.id] = true; });
  renderAlerts();
  toast('✓ All alerts acknowledged');
}

// ════════════════════════════════════════════════════════
// SIDEBAR (stores list + filter)
// ════════════════════════════════════════════════════════
var selectedStoreId = null;
var _storeFilter = '';

function renderStoreSidebar() {
  var list = document.getElementById('store-list');
  if (!list) return;
  var html = '';
  // "All stores" row — always visible
  html += '<button class="store-row' + (!selectedStoreId ? ' active' : '') + '" onclick="selectStore(null)">';
  html += '<div class="s-av ok">ALL</div>';
  html += '<div><div class="s-name">All Stores</div><div class="s-sub">Overview</div></div>';
  html += '</button>';

  if (!_storeFilter) {
    // No search — show a subtle prompt
    html += '<div class="sb-search-hint">🔍 Type to find a store</div>';
  } else {
    var stores = (db.stores || []).filter(function(s) {
      var q = _storeFilter;
      return s.name.toLowerCase().indexOf(q) !== -1
          || (s.storeNo || '').toLowerCase().indexOf(q) !== -1
          || (s.id || '').toLowerCase().indexOf(q) !== -1;
    });
    if (!stores.length) {
      html += '<div class="sb-search-hint">No stores match "' + _storeFilter + '"</div>';
    } else {
      stores.forEach(function(s) {
        var pct = storeProgress(s.id);
        var cls = pct >= 100 ? 'ok' : pct >= 50 ? 'warn' : 'bad';
        var init = s.name.slice(0, 2).toUpperCase();
        html += '<button class="store-row' + (selectedStoreId === s.id ? ' active' : '') + '" onclick="selectStore(\'' + s.id + '\')">';
        html += '<div class="s-av ' + cls + '">' + init + '</div>';
        html += '<div style="flex:1;min-width:0"><div class="s-name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + s.name + '</div><div class="s-sub">' + (s.storeNo || '') + '</div></div>';
        // Pending dot
        var storePending = (db.submissions || []).filter(function(sub){ return sub.storeId === s.id && !sub.approved; }).length;
        if (storePending > 0) {
          html += '<span style="display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:16px;background:var(--red);color:#fff;font-size:9px;font-weight:700;border-radius:8px;padding:0 4px;margin-right:4px">' + storePending + '</span>';
        }
        html += '<span class="s-pct ' + cls + '">' + pct + '%</span>';
        html += '</button>';
      });
    }
  }
  list.innerHTML = html;
}

function filterStores(val) {
  _storeFilter = (val || '').toLowerCase();
  renderStoreSidebar();
}

function selectStore(id) {
  selectedStoreId = id;
  var all = document.getElementById('view-all-stores');
  var det = document.getElementById('view-store-detail');
  if (id) {
    if (all) all.style.display = 'none';
    if (det) { det.style.display = 'block'; renderStoreDetail(id); }
  } else {
    if (all) all.style.display = 'block';
    if (det) det.style.display = 'none';
    renderStats(); renderCrewTable(); renderCompliancePanel(); renderFeed(); renderTempLogs(); renderAlerts(); renderEnergySummary();
  }
  renderStoreSidebar();
  // Close mobile sidebar after selection
  toggleSidebar(false);
}

// ════════════════════════════════════════════════════════
// SIDEBAR TOGGLE (burger menu)
// ════════════════════════════════════════════════════════
function toggleSidebar(forceState) {
  var sb = document.getElementById('sidebar');
  var ov = document.getElementById('sidebar-overlay');
  if (!sb) return;
  // On desktop (>768px) do nothing
  if (window.innerWidth > 768) return;
  var open = typeof forceState === 'boolean' ? forceState : !sb.classList.contains('open');
  sb.classList.toggle('open', open);
  if (ov) ov.classList.toggle('open', open);
  // Lock body scroll when sidebar open
  document.body.style.overflow = open ? 'hidden' : '';
}

// Close sidebar on resize to desktop
window.addEventListener('resize', function() {
  if (window.innerWidth > 768) {
    var sb = document.getElementById('sidebar');
    var ov = document.getElementById('sidebar-overlay');
    if (sb) sb.classList.remove('open');
    if (ov) ov.classList.remove('open');
    document.body.style.overflow = '';
  }
});

// ════════════════════════════════════════════════════════
// COMPLIANCE PANEL (unchanged logic, improved rendering)
// ════════════════════════════════════════════════════════
// ── LOCAL DATE HELPER ──────────────────────────────────
// toISOString() returns UTC date — in PHT (UTC+8) this is wrong between midnight-8AM.
// Always use local calendar date for date pickers and "today" comparisons.
function localDateStr(d) {
  var dt = d || new Date();
  var y  = dt.getFullYear();
  var mo = String(dt.getMonth() + 1).padStart(2, '0');
  var dy = String(dt.getDate()).padStart(2, '0');
  return y + '-' + mo + '-' + dy;
}

var compSelectedDate = localDateStr();
var compSearchQuery = '';
var compExpandedStore = null;

try { compSelectedDate = localStorage.getItem('comp_date') || compSelectedDate; } catch(e) {}
try { compSearchQuery = localStorage.getItem('comp_search') || ''; } catch(e) {}
try { compExpandedStore = localStorage.getItem('comp_expanded') || null; } catch(e) {}

function getComplianceLog(storeId, schedKey, dateStr) {
  var dateObj = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
  // Build dateKey to match server format: "Wed Jun 03 2026" (zero-padded day)
  // JS toDateString() gives "Wed Jun 3 2026" (no pad), server stores "Jun 03"
  var days  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var dd = String(dateObj.getDate()).padStart(2,'0');
  var dateKey = days[dateObj.getDay()] + ' ' + months[dateObj.getMonth()] + ' ' + dd + ' ' + dateObj.getFullYear();
  // Map UI schedule keys to the time-based keys stored in db.complianceLogs
  var timeKeyMap = { 'open7am': '7:0', 'light540': '17:40', 'close12mn': '0:0' };
  var timeKey = timeKeyMap[schedKey] || schedKey;
  return (db.complianceLogs || {})[storeId + '_' + dateKey + '_' + timeKey] || null;
}

function complianceBar(pct, completedAt) {
  if (pct === null) return '<div style="display:flex;align-items:center;gap:8px;margin-top:3px"><div style="flex:1;height:6px;background:var(--bg4);border-radius:3px"></div><span style="font-size:11px;color:var(--text3);width:34px;text-align:right">—</span></div>';
  var c = pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--amber)' : 'var(--red)';
  return '<div style="display:flex;align-items:center;gap:8px;margin-top:3px"><div style="flex:1;height:6px;background:var(--bg4);border-radius:3px;overflow:hidden"><div style="width:' + pct + '%;height:6px;background:' + c + ';border-radius:3px;transition:width 0.5s"></div></div><span style="font-size:12px;font-weight:700;color:' + c + ';width:34px;text-align:right">' + pct + '%' + (completedAt ? ' ✓' : '') + '</span></div>';
}

function setCompDate(d) {
  compSelectedDate = d;
  try { localStorage.setItem('comp_date', d); } catch(e) {}
  updateCompDateLabel();
  renderCompliancePanel();
}

function onCompSearch(v) {
  compSearchQuery = (v || '').toLowerCase();
  try { localStorage.setItem('comp_search', compSearchQuery); } catch(e) {}
  updateComplianceList();
}

function toggleCompStore(sid) {
  compExpandedStore = (compExpandedStore === sid) ? null : sid;
  try { localStorage.setItem('comp_expanded', compExpandedStore || ''); } catch(e) {}
  renderCompliancePanel();
}

function updateCompDateLabel() {
  var inp = document.getElementById('comp-date-inp');
  if (inp) inp.value = compSelectedDate;
  var today = localDateStr();
  var yday = new Date(today + 'T00:00:00'); yday.setDate(yday.getDate() - 1); var ydayStr = localDateStr(yday);
  var tb = document.getElementById('comp-btn-today');
  var yb = document.getElementById('comp-btn-yday');
  if (tb) { tb.style.background = compSelectedDate === today ? 'var(--red)' : 'var(--red-bg)'; tb.style.color = compSelectedDate === today ? '#fff' : 'var(--red)'; }
  if (yb) { yb.style.background = compSelectedDate === ydayStr ? 'var(--bg4)' : 'var(--bg3)'; }
}

function updateComplianceList() {
  var panel = document.getElementById('compliance-list-body');
  if (!panel) { renderCompliancePanel(); return; }
  // Re-render just list portion
  renderCompliancePanel();
}

function renderComplianceToolbar() {
  var tb = document.getElementById('compliance-toolbar');
  if (!tb) return;
  if (currentUser && currentUser.role === 'crew') { tb.innerHTML = ''; return; }

  // Don't replace the toolbar if the search input is currently focused
  // (user is typing). Instead just sync the date input value.
  var searchInp = document.getElementById('comp-search-inp');
  if (searchInp && document.activeElement === searchInp) {
    updateCompDateLabel();
    return;
  }

  var today = localDateStr();
  var yday = new Date(today + 'T00:00:00'); yday.setDate(yday.getDate() - 1); var ydayStr = localDateStr(yday);

  tb.innerHTML = [
    '<div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap">',
      '<div style="position:relative;flex:1;min-width:160px">',
        '<input id="comp-search-inp" type="text" placeholder="🔍 Search store…"',
        ' value="' + compSearchQuery.replace(/"/g, '&quot;') + '"',
        ' oninput="onCompSearch(this.value)"',
        ' style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--rs);padding:7px 11px;font-size:12px;color:var(--text);outline:none;font-family:var(--font)"',
        ' onfocus="this.style.borderColor=\'var(--red)\'" onblur="this.style.borderColor=\'var(--border)\'">',
      '</div>',
      '<div style="display:flex;align-items:center;gap:6px;flex-shrink:0">',
        '<input type="date" id="comp-date-inp" value="' + compSelectedDate + '" max="' + today + '"',
        ' onchange="setCompDate(this.value)"',
        ' style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--rs);padding:6px 10px;font-size:12px;color:var(--text);outline:none;font-family:var(--font);cursor:pointer">',
      '</div>',
      '<div style="display:flex;gap:4px;flex-shrink:0">',
        '<button id="comp-btn-today" data-date="' + today + '" onclick="setCompDate(this.dataset.date)" style="padding:6px 12px;border:1px solid var(--red-b);border-radius:var(--rs);background:var(--red-bg);color:var(--red);font-size:12px;font-weight:600;cursor:pointer;font-family:var(--font)">Today</button>',
        '<button id="comp-btn-yday" data-date="' + ydayStr + '" onclick="setCompDate(this.dataset.date)" style="padding:6px 12px;border:1px solid var(--border);border-radius:var(--rs);background:var(--bg3);color:var(--text2);font-size:12px;font-weight:600;cursor:pointer;font-family:var(--font)">Yesterday</button>',
      '</div>',
    '</div>'
  ].join('');
  updateCompDateLabel();
}

function renderCompliancePanel() {
  renderComplianceToolbar();
  var panel = document.getElementById('compliance-panel');
  if (!panel) return;
  var stores = (db.stores || []).filter(function(s) {
    return !compSearchQuery || s.name.toLowerCase().indexOf(compSearchQuery) !== -1;
  });
  if (!stores.length) {
    panel.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text3);font-size:13px">No stores match.</div>';
    return;
  }
  var SCHEDS = [
    { key: 'open7am',  label: '🌅 Opening 7AM',   graceMins: 90 },
    { key: 'light540', label: '💡 Lights 5:40PM',  graceMins: 90 },
    { key: 'close12mn',label: '🔴 Closing 12MN',   graceMins: 90 },
  ];
  var html = '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);overflow:hidden">';
  // Header row
  html += '<div style="display:grid;grid-template-columns:1fr repeat(' + SCHEDS.length + ',1fr);gap:0;border-bottom:1px solid var(--border);background:var(--bg3)">';
  html += '<div style="padding:9px 14px;font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.07em">Store</div>';
  SCHEDS.forEach(function(sc) {
    html += '<div style="padding:9px 10px;font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.06em;border-left:1px solid var(--border)">' + sc.label + '</div>';
  });
  html += '</div>';
  stores.forEach(function(s, idx) {
    var bg = idx % 2 === 0 ? '' : 'background:var(--bg3)';
    html += '<div style="display:grid;grid-template-columns:1fr repeat(' + SCHEDS.length + ',1fr);gap:0;border-bottom:1px solid var(--border);' + bg + '">';
    html += '<div style="padding:10px 14px;font-size:12px;font-weight:600">' + s.name + '</div>';
    SCHEDS.forEach(function(sc) {
      var log = getComplianceLog(s.id, sc.key, compSelectedDate);
      var pct = log ? (log.compliancePct !== undefined ? log.compliancePct : null) : null;
      var completedAt = log ? log.completedAt : null;
      html += '<div style="padding:8px 10px;border-left:1px solid var(--border)">' + complianceBar(pct, completedAt) + '</div>';
    });
    html += '</div>';
  });
  html += '</div>';
  panel.innerHTML = html;
}

// ════════════════════════════════════════════════════════
// STORE DETAIL — Time Filter State
// ════════════════════════════════════════════════════════
var _storeDetailRange = 'day';         // 'day' | 'week' | 'month' | 'custom'
var _storeDetailDate  = localDateStr();
var _storeDetailFrom  = '';
var _storeDetailTo    = '';
var _storeDetailSubOpen = false;       // submissions panel toggle

function sdSetRange(r) {
  _storeDetailRange = r;
  if (r !== 'custom') { _storeDetailFrom = ''; _storeDetailTo = ''; }
  if (selectedStoreId) renderStoreDetail(selectedStoreId);
}
function sdSetDate(v) {
  _storeDetailDate = v;
  if (selectedStoreId) renderStoreDetail(selectedStoreId);
}
function sdSetFrom(v) { _storeDetailFrom = v; if (selectedStoreId) renderStoreDetail(selectedStoreId); }
function sdSetTo(v)   { _storeDetailTo   = v; if (selectedStoreId) renderStoreDetail(selectedStoreId); }
function sdToggleSub() { _storeDetailSubOpen = !_storeDetailSubOpen; if (selectedStoreId) renderStoreDetail(selectedStoreId); }

function sdDateRange() {
  var now = new Date();
  var today = localDateStr(now);
  if (_storeDetailRange === 'day') {
    var d = _storeDetailDate || today;
    return { from: new Date(d + 'T00:00:00'), to: new Date(d + 'T23:59:59'), label: d === today ? 'Today' : d };
  }
  if (_storeDetailRange === 'week') {
    var base = new Date((_storeDetailDate || today) + 'T00:00:00');
    var dow = base.getDay();
    var mon = new Date(base); mon.setDate(base.getDate() - ((dow + 6) % 7));
    var sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23,59,59,999);
    return { from: mon, to: sun, label: 'Week of ' + mon.toLocaleDateString('en-PH',{month:'short',day:'numeric'}) };
  }
  if (_storeDetailRange === 'month') {
    var base2 = new Date((_storeDetailDate || today) + 'T00:00:00');
    var mFrom = new Date(base2.getFullYear(), base2.getMonth(), 1);
    var mTo   = new Date(base2.getFullYear(), base2.getMonth()+1, 0, 23, 59, 59, 999);
    return { from: mFrom, to: mTo, label: mFrom.toLocaleDateString('en-PH',{month:'long',year:'numeric'}) };
  }
  if (_storeDetailRange === 'custom' && _storeDetailFrom && _storeDetailTo) {
    return { from: new Date(_storeDetailFrom+'T00:00:00'), to: new Date(_storeDetailTo+'T23:59:59'), label: _storeDetailFrom + ' → ' + _storeDetailTo };
  }
  return { from: new Date(today+'T00:00:00'), to: new Date(today+'T23:59:59'), label: 'Today' };
}

// ════════════════════════════════════════════════════════
// STORE DETAIL VIEW
// ════════════════════════════════════════════════════════
function renderStoreDetail(storeId) {
  var store = (db.stores || []).find(function(s) { return s.id === storeId; });
  if (!store) return;
  var el = document.getElementById('store-detail-content');
  if (!el) return;

  var range = sdDateRange();
  var today = localDateStr();

  // Filter helpers
  function inRange(dateStr) {
    var d = new Date(dateStr);
    return d >= range.from && d <= range.to;
  }

  var allSubs   = (db.submissions || []).filter(function(s) { return s.storeId === storeId; });
  var rangedSubs = allSubs.filter(function(s) { return inRange(s.submittedAt); });
  var pending    = rangedSubs.filter(function(s) { return !s.approved; });
  var approved   = rangedSubs.filter(function(s) { return  s.approved; });
  var allTemps   = (db.tempLogs || []).filter(function(l) { return l.storeId === storeId; });
  var rangedTemps = allTemps.filter(function(l) { return inRange(l.submittedAt); });

  var pct = storeProgress(storeId);
  var color  = pct >= 100 ? 'var(--green)' : pct >= 50 ? 'var(--amber)' : 'var(--red)';
  var pillCls = pct >= 100 ? 'pill-green'  : pct >= 50 ? 'pill-amber'   : 'pill-red';

  var html = '';

  // ── Back button ──
  html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">';
  html += '<button onclick="selectStore(null)" style="padding:7px 12px;border:1px solid var(--border2);border-radius:var(--rs);background:var(--bg3);color:var(--text2);font-size:12px;font-weight:600;cursor:pointer;font-family:var(--font)">← Back</button>';
  html += '<div class="sec-title" style="margin:0">' + store.name + '</div>';
  html += '</div>';

  // ── Store header card ──
  html += '<div class="store-detail-header">';
  html += '<div class="store-detail-av">' + store.name.slice(0,2).toUpperCase() + '</div>';
  html += '<div style="flex:1"><div class="store-detail-name">' + store.name + '</div>';
  html += '<div class="store-detail-meta">Store No. ' + (store.storeNo||'—') + ' &nbsp;·&nbsp; ' + (store.storeStatus||'Opening') + '</div></div>';
  html += '<div style="text-align:right"><div style="font-size:28px;font-weight:800;font-family:var(--mono);color:' + color + '">' + pct + '%</div>';
  html += '<span class="pill ' + pillCls + '">' + (pct >= 100 ? '✓ Complete' : pct >= 50 ? 'In Progress' : 'Pending') + '</span></div>';
  html += '</div>';

  // ══════════════════════════════════════════════════════
  // SHARED TIME FILTER BAR
  // ══════════════════════════════════════════════════════
  html += '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:12px 14px;margin-bottom:16px">';
  html += '<div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px">📅 Time Range — applies to Compliance, Temperature Logs & Energy</div>';
  html += '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">';

  // Range pills
  ['day','week','month','custom'].forEach(function(r) {
    var active = _storeDetailRange === r;
    var label  = r === 'day' ? 'Day' : r === 'week' ? 'Week' : r === 'month' ? 'Month' : 'Custom';
    html += '<button onclick="sdSetRange(\'' + r + '\')" style="padding:5px 13px;border:1px solid ' + (active?'var(--red-b)':'var(--border)') + ';border-radius:20px;background:' + (active?'var(--red-bg)':'var(--bg3)') + ';color:' + (active?'var(--red)':'var(--text2)') + ';font-size:11px;font-weight:600;cursor:pointer;font-family:var(--font)">' + label + '</button>';
  });

  // Date picker (day/week/month)
  if (_storeDetailRange !== 'custom') {
    html += '<input type="date" value="' + (_storeDetailDate||today) + '" max="' + today + '" onchange="sdSetDate(this.value)" style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--rs);padding:5px 10px;font-size:11px;color:var(--text);outline:none;font-family:var(--mono);cursor:pointer">';
    html += '<button onclick="sdSetDate(\'' + today + '\')" style="padding:5px 10px;border:1px solid var(--border);border-radius:var(--rs);background:var(--bg3);color:var(--text2);font-size:11px;font-weight:600;cursor:pointer;font-family:var(--font)">Today</button>';
  } else {
    // Custom from–to
    html += '<span style="font-size:11px;color:var(--text3)">From</span>';
    html += '<input type="date" value="' + (_storeDetailFrom||today) + '" max="' + today + '" onchange="sdSetFrom(this.value)" style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--rs);padding:5px 10px;font-size:11px;color:var(--text);outline:none;font-family:var(--mono);cursor:pointer">';
    html += '<span style="font-size:11px;color:var(--text3)">To</span>';
    html += '<input type="date" value="' + (_storeDetailTo||today) + '" max="' + today + '" onchange="sdSetTo(this.value)" style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--rs);padding:5px 10px;font-size:11px;color:var(--text);outline:none;font-family:var(--mono);cursor:pointer">';
  }

  html += '</div>';
  html += '<div style="margin-top:7px;font-size:11px;color:var(--text3)">Showing: <b style="color:var(--text2)">' + range.label + '</b></div>';
  html += '</div>';

  // ── Stats row (ranged) ──
  var approvalRate = rangedSubs.length > 0 ? Math.round((approved.length / rangedSubs.length) * 100) : 0;
  html += '<div class="kwh-stat-row" style="grid-template-columns:repeat(4,1fr)">';
  html += '<div class="kwh-stat"><div class="kwh-stat-lbl">Submissions</div><div class="kwh-stat-val" style="color:var(--blue)">' + rangedSubs.length + '</div><div class="kwh-stat-sub">' + range.label + '</div></div>';
  html += '<div class="kwh-stat"><div class="kwh-stat-lbl">Pending</div><div class="kwh-stat-val" style="color:var(--amber)">' + pending.length + '</div><div class="kwh-stat-sub">need approval</div></div>';
  html += '<div class="kwh-stat"><div class="kwh-stat-lbl">Approved</div><div class="kwh-stat-val" style="color:var(--green)">' + approved.length + '</div><div class="kwh-stat-sub">' + approvalRate + '% rate</div></div>';
  html += '<div class="kwh-stat"><div class="kwh-stat-lbl">Temp Logs</div><div class="kwh-stat-val" style="color:var(--green)">' + rangedTemps.length + '</div><div class="kwh-stat-sub">in range</div></div>';
  html += '</div>';

  // ── Compliance Rate (ranged) ──
  html += '<div class="sec-title">📊 Compliance Rate — ' + range.label + '</div>';
  var SCHEDS_SD = [
    { key:'open7am',   label:'🌅 Opening 7AM' },
    { key:'light540',  label:'💡 Lights 5:40PM' },
    { key:'close12mn', label:'🔴 Closing 12MN' },
  ];
  html += '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);overflow:hidden;margin-bottom:16px">';
  html += '<div style="display:grid;grid-template-columns:1fr repeat(3,1fr);background:var(--bg3);border-bottom:1px solid var(--border)">';
  html += '<div style="padding:9px 14px;font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.07em">Shift</div>';
  SCHEDS_SD.forEach(function(sc) {
    html += '<div style="padding:9px 10px;font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.06em;border-left:1px solid var(--border)">' + sc.label + '</div>';
  });
  html += '</div>';
  // Compliance data row for this store
  html += '<div style="display:grid;grid-template-columns:1fr repeat(3,1fr)">';
  html += '<div style="padding:10px 14px;font-size:12px;font-weight:600">' + store.name + '</div>';
  SCHEDS_SD.forEach(function(sc) {
    var log = getComplianceLog(storeId, sc.key, _storeDetailDate || today);
    var pctC = log ? (log.compliancePct !== undefined ? log.compliancePct : null) : null;
    html += '<div style="padding:8px 10px;border-left:1px solid var(--border)">' + complianceBar(pctC, log ? log.completedAt : null) + '</div>';
  });
  html += '</div></div>';

  // ── Submissions (collapsible — pending visible, approved collapsed) ──
  html += '<div class="sec-title">📥 Submissions — ' + range.label;
  if (pending.length > 0) {
    html += ' <span style="display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;background:var(--red);color:#fff;font-size:10px;font-weight:700;border-radius:9px;padding:0 5px;vertical-align:middle;margin-left:4px">' + pending.length + '</span>';
  }
  html += '</div>';

  if (rangedSubs.length === 0) {
    html += '<div style="padding:20px;text-align:center;color:var(--text3);font-size:13px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);margin-bottom:16px">No submissions in this range.</div>';
  } else {
    // Pending always visible
    if (pending.length > 0) {
      html += '<div style="margin-bottom:8px">';
      pending.forEach(function(s) { html += buildSubCard(s, true); });
      html += '</div>';
    } else {
      html += '<div style="padding:10px 14px;font-size:12px;color:var(--green);background:var(--green-bg);border:1px solid var(--green-b);border-radius:var(--rs);margin-bottom:8px">✅ No pending submissions in this range.</div>';
    }

    // Approved — collapsible
    var toggleStyle = 'display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--rs);cursor:pointer;margin-bottom:' + (_storeDetailSubOpen ? '8px' : '0') + ';user-select:none';
    html += '<div onclick="sdToggleSub()" style="' + toggleStyle + '" onmouseover="this.style.background=\'var(--bg4)\'" onmouseout="this.style.background=\'var(--bg3)\'">';
    html += '<span style="font-size:12px;font-weight:600;flex:1">Approved (' + approved.length + ')</span>';
    html += '<span style="font-size:11px;color:var(--text3);transform:rotate(' + (_storeDetailSubOpen?'90':'0') + 'deg);display:inline-block;transition:transform 0.2s">▶</span>';
    html += '</div>';
    if (_storeDetailSubOpen && approved.length > 0) {
      approved.forEach(function(s) { html += buildSubCard(s, false); });
    }
    html += '<div style="margin-bottom:16px"></div>';
  }

  // ── Temperature Logs (ranged) ──
  html += '<div class="sec-title">🌡️ Temperature Logs — ' + range.label + '</div>';
  if (rangedTemps.length === 0) {
    html += '<div style="padding:16px;text-align:center;color:var(--text3);font-size:13px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);margin-bottom:16px">No temperature logs in this range.</div>';
  } else {
    html += '<div class="temp-table-wrap" style="margin-bottom:16px"><table class="temp-table"><thead><tr><th>Shift</th><th>Crew</th><th>Readings</th><th>Time</th></tr></thead><tbody>';
    rangedTemps.slice().reverse().forEach(function(l) {
      var ts = new Date(l.submittedAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      var readingCount = Object.keys(l.readings || {}).length;
      html += '<tr><td>' + (l.shift||'—') + '</td><td>' + (l.crew||'—') + '</td>';
      html += '<td class="temp-ok">' + readingCount + ' readings</td>';
      html += '<td>' + ts + '</td></tr>';
    });
    html += '</tbody></table></div>';
  }

  // ── Energy Consumption (ranged multiplier) ──
  var rangeDays = 1;
  if (_storeDetailRange === 'week')  rangeDays = 7;
  if (_storeDetailRange === 'month') rangeDays = 30;
  if (_storeDetailRange === 'custom' && _storeDetailFrom && _storeDetailTo) {
    var diffMs = new Date(_storeDetailTo+'T23:59:59') - new Date(_storeDetailFrom+'T00:00:00');
    rangeDays = Math.max(1, Math.round(diffMs / 86400000));
  }
  var RATE = MERALCO_RATE;
  var totalKwhDay   = APPLIANCES.reduce(function(s,a){ return s + calcKwhDay(a); }, 0);
  var totalKwhRange = parseFloat((totalKwhDay * rangeDays).toFixed(3));
  var costRange     = (totalKwhRange * RATE).toFixed(2);
  var topApp        = APPLIANCES.slice().sort(function(a,b){ return calcKwhDay(b)-calcKwhDay(a); })[0];

  html += '<div class="sec-title">⚡ Energy Consumption — ' + range.label + '</div>';
  html += '<div style="font-size:10px;color:var(--text3);margin-bottom:10px">Rate: ₱' + RATE.toFixed(4) + '/kWh · June 2026 Official Meralco Rate · kWh = kW × operating hrs/day</div>';
  html += '<div class="kwh-stat-row" style="grid-template-columns:repeat(4,1fr);margin-bottom:12px">';
  html += '<div class="kwh-stat"><div class="kwh-stat-lbl">kWh (' + rangeDays + 'd)</div><div class="kwh-stat-val" style="color:var(--blue)">' + totalKwhRange + '</div><div class="kwh-stat-sub">1 store</div></div>';
  html += '<div class="kwh-stat"><div class="kwh-stat-lbl">Cost</div><div class="kwh-stat-val" style="color:var(--amber)">₱' + parseFloat(costRange).toLocaleString('en-PH',{minimumFractionDigits:2}) + '</div><div class="kwh-stat-sub">@ ₱' + RATE.toFixed(4) + '/kWh</div></div>';
  html += '<div class="kwh-stat"><div class="kwh-stat-lbl">Daily Avg</div><div class="kwh-stat-val" style="color:var(--green)">' + totalKwhDay.toFixed(3) + ' kWh</div><div class="kwh-stat-sub">per store</div></div>';
  if (topApp) { html += '<div class="kwh-stat"><div class="kwh-stat-lbl">Top Consumer</div><div class="kwh-stat-val" style="font-size:11px;color:var(--red);line-height:1.3">' + topApp.name + '</div><div class="kwh-stat-sub">' + calcKwhDay(topApp).toFixed(3) + ' kWh/day</div></div>'; }
  html += '</div>';

  // Category breakdown bar chart
  var cats = ['HVAC','Lighting','Equipment','Freezer','Chiller'];
  var catPaletteSD = {HVAC:'#3B9EFF',Lighting:'#F5A623',Equipment:'#1DB37A',Freezer:'#06B6D4',Chiller:'#A855F7'};
  var catTotals = {};
  cats.forEach(function(c) {
    catTotals[c] = APPLIANCES.filter(function(a){return a.cat===c;}).reduce(function(s,a){return s+calcKwhDay(a);},0);
  });
  html += '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:14px;margin-bottom:20px">';
  html += '<div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:10px">kWh Breakdown by Category</div>';
  // Stacked bar
  html += '<div style="display:flex;height:8px;border-radius:5px;overflow:hidden;margin-bottom:10px">';
  cats.forEach(function(c){
    var p = totalKwhDay > 0 ? (catTotals[c]/totalKwhDay*100).toFixed(2) : 0;
    html += '<div style="width:'+p+'%;background:'+catPaletteSD[c]+'" title="'+c+'"></div>';
  });
  html += '</div>';
  cats.forEach(function(c) {
    var kwhC   = parseFloat((catTotals[c] * rangeDays).toFixed(3));
    var pctBar = totalKwhDay > 0 ? (catTotals[c] / totalKwhDay * 100) : 0;
    var col    = catPaletteSD[c] || 'var(--blue)';
    var pesCRng= (catTotals[c] * rangeDays * RATE).toFixed(2);
    html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:7px">';
    html += '<div style="width:8px;height:8px;border-radius:2px;background:'+col+';flex-shrink:0"></div>';
    html += '<div style="width:68px;font-size:10px;font-weight:600;color:var(--text2);flex-shrink:0">' + c + '</div>';
    html += '<div style="flex:1;height:5px;background:var(--bg4);border-radius:3px;overflow:hidden"><div style="width:' + pctBar.toFixed(2) + '%;height:5px;background:' + col + ';border-radius:3px;transition:width 0.5s"></div></div>';
    html += '<div style="font-size:10px;font-family:var(--mono);font-weight:700;color:' + col + ';width:68px;text-align:right">' + kwhC + ' kWh</div>';
    html += '<div style="font-size:10px;color:var(--text3);width:36px;text-align:right">' + pctBar.toFixed(1) + '%</div>';
    html += '<div style="font-size:10px;font-family:var(--mono);color:var(--text2);width:72px;text-align:right">₱' + pesCRng + '</div>';
    html += '</div>';
  });
  html += '</div>';

  el.innerHTML = html;
}

// ════════════════════════════════════════════════════════
// ENERGY SUMMARY — Real data, accurate calculations
// Meralco June 2026 approved rate: ₱14.3345/kWh
// Source: ERC Case No. 2024-052 RC, effective June 2026
// kWh = kW × actual operating hours per day
// ₱/Day  = kWh/Day × MERALCO_RATE
// ₱/Month = ₱/Day × 30.4375 (avg days/month)
// ₱/Mo All = ₱/Month × storeCount
// ════════════════════════════════════════════════════════
var MERALCO_RATE = 14.3345;          // ₱/kWh — June 2026 official Meralco rate
var DAYS_PER_MONTH = 30.4375;        // 365/12 — more accurate than 30
var CHART_COLORS = ['#3B9EFF','#1DB37A','#F5A623','#E8001D','#A855F7','#06B6D4','#F97316','#84CC16'];
var energyViewMode  = 'all';
var energyCatFilter = 'all';

// ── APPLIANCE LIST ─────────────────────────────────────
// kW  = rated wattage ÷ 1000 (nameplate / EE label)
// hrs = actual daily operating hours based on Alfamart
//       operating schedule (store open 07:00–00:00, 17h)
//       Freezers/chiller run 24h (compressor duty cycle
//       averaged at 60–70% → effective full-equivalent hrs)
// ON / OFF labels = time strings shown in the table
// ──────────────────────────────────────────────────────
var APPLIANCES = [
  // ── HVAC ──
  // 1 HP window/split = 0.746 kW rated; avg 0.85 kW incl. start surges
  // Store typically runs 2 units, but table shows per-unit cost
  {name:'A/C Window 1.0 HP (per unit)',     cat:'HVAC',      kw:0.850,  on:'7:00 AM',  off:'10:00 PM', hrs:15.0},
  {name:'A/C Split 1.5 HP (per unit)',      cat:'HVAC',      kw:1.250,  on:'7:00 AM',  off:'10:00 PM', hrs:15.0},
  {name:'A/C Split 2.0 HP (per unit)',      cat:'HVAC',      kw:1.650,  on:'7:00 AM',  off:'10:00 PM', hrs:15.0},
  // ── Lighting ──
  // Exterior signage on at 5:40 PM checklist time, off at store close 12MN = 6.33h
  {name:'Flood Light 250W (exterior)',      cat:'Lighting',  kw:0.250,  on:'5:40 PM',  off:'12:00 MN', hrs:6.33},
  {name:'Façade LED Strip',                 cat:'Lighting',  kw:0.080,  on:'5:40 PM',  off:'12:00 MN', hrs:6.33},
  {name:'Pylon / Pole Sign',                cat:'Lighting',  kw:0.150,  on:'5:40 PM',  off:'12:00 MN', hrs:6.33},
  // Canopy lights on all operating hours 7AM–12MN = 17h
  {name:'Canopy Lights (LED panel)',        cat:'Lighting',  kw:0.200,  on:'7:00 AM',  off:'12:00 MN', hrs:17.0},
  // Selling area: 50% dimmed opening 6AM–10AM (4h), then 100% 10AM–12MN (14h)
  // Listed separately so the table is honest — two rows, two entries
  {name:'Selling Area Lights 50% (dim)',    cat:'Lighting',  kw:1.200,  on:'6:00 AM',  off:'10:00 AM', hrs:4.0},
  {name:'Selling Area Lights 100%',         cat:'Lighting',  kw:2.400,  on:'10:00 AM', off:'12:00 MN', hrs:14.0},
  // ── Equipment ──
  {name:'POS Terminal + Network',           cat:'Equipment', kw:0.300,  on:'7:00 AM',  off:'12:00 MN', hrs:17.0},
  // RTE (ready-to-eat) equipment runs from store prep (6AM) through close 12MN = 18h
  // but thermal cycling means effective draw is ~80% rated
  {name:'RTE Rice Cooker',                  cat:'Equipment', kw:0.600,  on:'6:00 AM',  off:'12:00 MN', hrs:18.0},
  {name:'RTE Boiler / Hot Water',           cat:'Equipment', kw:1.500,  on:'6:00 AM',  off:'12:00 MN', hrs:18.0},
  {name:'RTE Food Steamer',                 cat:'Equipment', kw:0.800,  on:'6:00 AM',  off:'12:00 MN', hrs:18.0},
  {name:'RTE Deep Fryer',                   cat:'Equipment', kw:2.000,  on:'6:00 AM',  off:'12:00 MN', hrs:18.0},
  {name:'RTE Electric Kettle',              cat:'Equipment', kw:1.500,  on:'6:00 AM',  off:'12:00 MN', hrs:18.0},
  // ── Freezers ──
  // Chest / upright freezers are always-on; compressor duty cycle ~65%
  // Effective equiv. hrs = 24 × 0.65 = 15.6h of full-rated draw
  {name:'Chest Freezer (per unit)',         cat:'Freezer',   kw:0.350,  on:'Always',   off:'Always',   hrs:15.6},
  {name:'Upright Freezer (per unit)',       cat:'Freezer',   kw:0.450,  on:'Always',   off:'Always',   hrs:15.6},
  // ── Chillers ──
  // Display chiller runs during operating hours; duty cycle ~70%
  // Effective hrs = 17 × 0.70 = 11.9h
  {name:'Display Chiller / Cooler',         cat:'Chiller',   kw:0.400,  on:'7:00 AM',  off:'12:00 MN', hrs:11.9},
  {name:'Open Deck Chiller (per door)',     cat:'Chiller',   kw:0.550,  on:'7:00 AM',  off:'12:00 MN', hrs:11.9},
];

// ── CALCULATION HELPERS ───────────────────────────────
function calcKwhDay(a)  { return a.kw * a.hrs; }
function calcPesosDay(a, rate) { return calcKwhDay(a) * rate; }
function calcPesosMonth(a, rate) { return calcPesosDay(a, rate) * DAYS_PER_MONTH; }
function calcPesosMonthAll(a, rate, n) { return calcPesosMonth(a, rate) * n; }

function renderEnergySummary() {
  var wrap = document.getElementById('energy-summary-wrap');
  if (!wrap) return;

  var stores     = db.stores || [];
  var storeCount = stores.length || 1;
  var isAll      = energyViewMode === 'all';
  var storeLabel = isAll ? 'All ' + storeCount + ' Stores' : 'Per Store';
  var list       = energyCatFilter === 'all'
                    ? APPLIANCES
                    : APPLIANCES.filter(function(a) { return a.cat === energyCatFilter; });
  var RATE = MERALCO_RATE;
  var n = isAll ? storeCount : 1;

  var CAT_COLORS  = {HVAC:'#3B9EFF',Lighting:'#F5A623',Equipment:'#1DB37A',Freezer:'#06B6D4',Chiller:'#A855F7'};
  var CAT_BG      = {HVAC:'rgba(59,158,255,.12)',Lighting:'rgba(245,166,35,.12)',Equipment:'rgba(29,179,122,.12)',Freezer:'rgba(6,182,212,.12)',Chiller:'rgba(168,85,247,.12)'};
  var CATS        = ['HVAC','Lighting','Equipment','Freezer','Chiller'];

  // ── helper: compute per-category totals across ALL appliances (for breakdown section) ──
  var catTotalsAll = {};
  CATS.forEach(function(c) {
    catTotalsAll[c] = APPLIANCES.filter(function(a){return a.cat===c;}).reduce(function(s,a){return s+calcKwhDay(a);},0);
  });
  var grandKwh = CATS.reduce(function(s,c){return s+catTotalsAll[c];},0);

  var html = '';

  // ════════════════════════════════════════════
  // RATE BANNER
  // ════════════════════════════════════════════
  html += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:var(--bg2);border:1px solid var(--border);border-radius:var(--rs);padding:10px 14px;margin-bottom:12px">';
  html += '<span style="font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.07em">Meralco Rate</span>';
  html += '<span style="font-family:var(--mono);font-size:14px;font-weight:700;color:var(--amber)">₱' + RATE.toFixed(4) + '/kWh</span>';
  html += '<span style="font-size:10px;color:var(--text3)">·</span>';
  html += '<span style="font-size:11px;color:var(--text2)">June 2026 Official (ERC-approved)</span>';
  html += '<span style="font-size:10px;color:var(--text3)">·</span>';
  html += '<span style="font-size:11px;color:var(--text2)">Avg ' + DAYS_PER_MONTH + ' days/month</span>';
  html += '<span style="margin-left:auto;font-size:10px;color:var(--text3);font-family:var(--mono)">kWh = kW × hrs/day</span>';
  html += '</div>';

  // ════════════════════════════════════════════
  // FILTERS
  // ════════════════════════════════════════════
  html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;align-items:center">';
  ['all','HVAC','Lighting','Equipment','Freezer','Chiller'].forEach(function(cat) {
    var active  = energyCatFilter === cat;
    var count   = cat === 'all' ? APPLIANCES.length : APPLIANCES.filter(function(a){return a.cat===cat;}).length;
    var activeBg    = active ? 'var(--red-bg)' : 'var(--bg2)';
    var activeColor = active ? 'var(--red)'    : 'var(--text2)';
    var activeBdr   = active ? 'var(--red-b)'  : 'var(--border)';
    html += '<button data-val="' + cat + '" onclick="setEnergyCat(this)" style="padding:5px 12px;border:1px solid ' + activeBdr + ';border-radius:20px;background:' + activeBg + ';color:' + activeColor + ';font-size:11px;font-weight:600;cursor:pointer;font-family:var(--font);transition:.15s">';
    html += cat + ' <span style="font-size:9px;opacity:.65">(' + count + ')</span></button>';
  });
  html += '<div style="margin-left:auto;display:flex;gap:2px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--rs);padding:2px">';
  ['all','per'].forEach(function(v) {
    var active = energyViewMode === v;
    html += '<button data-val="' + v + '" onclick="setEnergyView(this)" style="padding:5px 11px;border:none;border-radius:6px;background:' + (active?'var(--bg4)':'transparent') + ';color:' + (active?'var(--text)':'var(--text3)') + ';font-size:11px;font-weight:600;cursor:pointer;font-family:var(--font);box-shadow:' + (active?'0 0 0 1px var(--border2)':'none') + '">';
    html += (v==='all'?'All Stores':'Per Store') + '</button>';
  });
  html += '</div></div>';

  // ════════════════════════════════════════════
  // SUMMARY STAT CARDS
  // ════════════════════════════════════════════
  var filtKwhDay = list.reduce(function(s,a){return s+calcKwhDay(a);},0) * n;
  var filtKwhMo  = filtKwhDay * DAYS_PER_MONTH;
  var filtPesDay = list.reduce(function(s,a){return s+calcPesosDay(a,RATE);},0) * n;
  var filtPesMo  = filtPesDay * DAYS_PER_MONTH;
  var topA       = list.slice().sort(function(a,b){return calcKwhDay(b)-calcKwhDay(a);})[0];

  var statCards = [
    {lbl:'kWh / Day',    val: filtKwhDay.toFixed(2),                          sub: storeLabel,                        color:'var(--blue)'},
    {lbl:'kWh / Month',  val: filtKwhMo.toFixed(1),                           sub: '× ' + DAYS_PER_MONTH + ' days',  color:'var(--amber)'},
    {lbl:'Cost / Day',   val: '₱' + filtPesDay.toFixed(2),                    sub: '@ ₱' + RATE + '/kWh',            color:'var(--green)'},
    {lbl:'Cost / Month', val: '₱' + Math.round(filtPesMo).toLocaleString(),   sub: storeLabel,                       color:'var(--red)'}
  ];

  html += '<div class="stat-grid" style="margin-bottom:16px">';
  statCards.forEach(function(c) {
    html += '<div class="stat-card">';
    html += '<div class="stat-lbl">' + c.lbl + '</div>';
    html += '<div class="stat-val" style="color:' + c.color + '">' + c.val + '</div>';
    html += '<div class="stat-trend">' + c.sub + '</div>';
    html += '</div>';
  });
  if (topA) {
    html += '<div class="stat-card">';
    html += '<div class="stat-lbl">Top Consumer</div>';
    html += '<div class="stat-val" style="font-size:13px;color:var(--amber);line-height:1.3;margin-top:2px">' + topA.name + '</div>';
    html += '<div class="stat-trend">' + calcKwhDay(topA).toFixed(3) + ' kWh/day · ₱' + calcPesosMonth(topA, RATE).toFixed(0) + '/mo</div>';
    html += '</div>';
  }
  html += '</div>';

  // ════════════════════════════════════════════
  // TWO-COLUMN: Category breakdown + stacked chart
  // ════════════════════════════════════════════
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px">';

  // LEFT: Stacked bar + legend rows
  html += '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:14px 16px">';
  html += '<div style="font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.07em;margin-bottom:12px">Daily kWh by Category (per store)</div>';

  // Stacked bar
  html += '<div style="display:flex;height:8px;border-radius:6px;overflow:hidden;margin-bottom:14px">';
  CATS.forEach(function(c) {
    var pBar = grandKwh > 0 ? (catTotalsAll[c]/grandKwh*100) : 0;
    html += '<div style="width:' + pBar.toFixed(2) + '%;background:' + CAT_COLORS[c] + ';transition:width .5s" title="' + c + ': ' + catTotalsAll[c].toFixed(3) + ' kWh/day"></div>';
  });
  html += '</div>';

  // Legend rows
  CATS.forEach(function(c) {
    var kwhC  = catTotalsAll[c];
    var pctC  = grandKwh > 0 ? kwhC/grandKwh*100 : 0;
    var pesC  = isAll ? kwhC*RATE*DAYS_PER_MONTH*storeCount : kwhC*RATE*DAYS_PER_MONTH;
    var col   = CAT_COLORS[c];
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px">';
    html += '<div style="width:8px;height:8px;border-radius:2px;background:'+col+';flex-shrink:0"></div>';
    html += '<div style="width:62px;font-size:11px;font-weight:600;color:var(--text2);flex-shrink:0">' + c + '</div>';
    html += '<div style="flex:1;height:4px;background:var(--bg4);border-radius:2px;overflow:hidden"><div style="width:'+pctC.toFixed(2)+'%;height:4px;background:'+col+';border-radius:2px;transition:width .5s"></div></div>';
    html += '<div style="font-size:10px;font-family:var(--mono);font-weight:700;color:'+col+';width:62px;text-align:right">'+kwhC.toFixed(3)+' kWh</div>';
    html += '<div style="font-size:10px;color:var(--text3);width:28px;text-align:right">'+pctC.toFixed(1)+'%</div>';
    html += '<div style="font-size:10px;font-family:var(--mono);color:var(--text2);width:60px;text-align:right">₱'+pesC.toFixed(0)+'/mo</div>';
    html += '</div>';
  });
  html += '</div>'; // end left column

  // RIGHT: kWh share pill chart (visual bar-based, no external chart needed)
  html += '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:14px 16px">';
  html += '<div style="font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.07em;margin-bottom:14px">kWh Share by Category</div>';
  CATS.forEach(function(c) {
    var pct  = grandKwh > 0 ? catTotalsAll[c]/grandKwh*100 : 0;
    var col  = CAT_COLORS[c];
    var bg   = CAT_BG[c];
    html += '<div style="margin-bottom:10px">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">';
    html += '<span style="display:inline-flex;align-items:center;font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;background:'+bg+';color:'+col+'">' + c + '</span>';
    html += '<span style="font-size:11px;font-family:var(--mono);font-weight:700;color:'+col+'">' + pct.toFixed(1) + '%</span>';
    html += '</div>';
    html += '<div style="height:6px;background:var(--bg4);border-radius:4px;overflow:hidden">';
    html += '<div style="width:'+pct.toFixed(2)+'%;height:6px;background:'+col+';border-radius:4px;transition:width .5s"></div>';
    html += '</div>';
    html += '</div>';
  });
  html += '</div>'; // end right column
  html += '</div>'; // end two-col grid

  // ════════════════════════════════════════════
  // APPLIANCE TABLE
  // ════════════════════════════════════════════
  var totalKwhAll = list.reduce(function(s,a){return s+calcKwhDay(a);},0);
  var lastColHdr  = isAll ? '₱/Mo (' + storeCount + ' Stores)' : '% of Total';

  html += '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);overflow:hidden;margin-bottom:16px">';
  html += '<div style="overflow-x:auto">';
  html += '<table style="width:100%;border-collapse:collapse;font-size:12px">';
  html += '<thead><tr style="background:var(--bg3)">';
  ['Appliance','Cat','kW','On','Off','Hrs','kWh/Day','₱/Day','₱/Month',lastColHdr].forEach(function(h) {
    html += '<th style="padding:8px 10px;font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.07em;text-align:left;border-bottom:1px solid var(--border);white-space:nowrap">' + h + '</th>';
  });
  html += '</tr></thead><tbody>';

  list.forEach(function(a, i) {
    var kwhD    = calcKwhDay(a);
    var pesD    = calcPesosDay(a, RATE) * n;
    var pesM    = calcPesosMonth(a, RATE) * n;
    var pesMAll = calcPesosMonthAll(a, RATE, storeCount);
    var pctTot  = totalKwhAll > 0 ? (kwhD/totalKwhAll*100) : 0;
    var barW    = Math.min(100, Math.round(pctTot * 1.5));
    var col     = CAT_COLORS[a.cat];
    var bg      = CAT_BG[a.cat];
    var rowBg   = i%2===0 ? '' : 'background:var(--bg3)';
    var lastCol = isAll
      ? '<td style="padding:8px 10px;font-family:var(--mono);font-weight:700;color:var(--amber)">₱' + pesMAll.toFixed(2) + '</td>'
      : '<td style="padding:8px 10px;font-family:var(--mono);font-weight:700;color:' + (pctTot>=20?'var(--red)':pctTot>=10?'var(--amber)':'var(--green)') + '">' + pctTot.toFixed(1) + '%</td>';

    html += '<tr style="' + rowBg + '">';
    html += '<td style="padding:8px 10px">';
    html += '<div style="font-size:12px;font-weight:500;white-space:nowrap;color:var(--text)">' + a.name + '</div>';
    html += '<div style="height:2px;background:var(--border);border-radius:2px;margin-top:4px;width:70px"><div style="height:2px;width:'+barW+'%;background:'+col+';border-radius:2px"></div></div>';
    html += '</td>';
    html += '<td style="padding:8px 10px"><span style="display:inline-flex;font-size:9px;font-weight:600;padding:2px 7px;border-radius:10px;background:'+bg+';color:'+col+'">' + a.cat + '</span></td>';
    html += '<td style="padding:8px 10px;font-family:var(--mono);color:var(--amber);font-weight:700">' + a.kw.toFixed(3) + '</td>';
    html += '<td style="padding:8px 10px;font-size:11px;color:var(--green);font-weight:500">' + a.on + '</td>';
    html += '<td style="padding:8px 10px;font-size:11px;color:var(--red);font-weight:500">' + a.off + '</td>';
    html += '<td style="padding:8px 10px;font-family:var(--mono);color:var(--text2)">' + a.hrs.toFixed(2) + 'h</td>';
    html += '<td style="padding:8px 10px;font-family:var(--mono);font-weight:700;color:var(--blue)">' + kwhD.toFixed(4) + '</td>';
    html += '<td style="padding:8px 10px;font-family:var(--mono);color:var(--text)">₱' + pesD.toFixed(2) + '</td>';
    html += '<td style="padding:8px 10px;font-family:var(--mono);font-weight:700;color:var(--text)">₱' + pesM.toFixed(2) + '</td>';
    html += lastCol;
    html += '</tr>';
  });

  // Totals row
  var totKwh   = list.reduce(function(s,a){return s+calcKwhDay(a);},0);
  var totPesD  = list.reduce(function(s,a){return s+calcPesosDay(a,RATE)*n;},0);
  var totPesM  = list.reduce(function(s,a){return s+calcPesosMonth(a,RATE)*n;},0);
  var totLast  = isAll ? list.reduce(function(s,a){return s+calcPesosMonthAll(a,RATE,storeCount);},0) : 100;

  html += '<tr style="background:var(--bg4);border-top:2px solid var(--border2)">';
  html += '<td colspan="2" style="padding:10px;font-size:12px;font-weight:700;color:var(--text)">Total (' + list.length + ' appliances)</td>';
  html += '<td colspan="4" style="padding:10px"></td>';
  html += '<td style="padding:10px;font-family:var(--mono);font-weight:800;color:var(--blue);font-size:13px">' + totKwh.toFixed(4) + '</td>';
  html += '<td style="padding:10px;font-family:var(--mono);font-weight:700">₱' + totPesD.toFixed(2) + '</td>';
  html += '<td style="padding:10px;font-family:var(--mono);font-weight:700">₱' + totPesM.toFixed(2) + '</td>';
  html += '<td style="padding:10px;font-family:var(--mono);font-weight:700;color:var(--amber)">' + (isAll?'₱'+totLast.toFixed(2):'100%') + '</td>';
  html += '</tr>';
  html += '</tbody></table></div></div>';

  // ── Set HTML ──
  wrap.innerHTML = html;
}

function setEnergyView(el)  { energyViewMode  = el.getAttribute('data-val'); renderEnergySummary(); }
function setEnergyCat(el)   { energyCatFilter = el.getAttribute('data-val'); renderEnergySummary(); }
function setMeralcoView(el) { renderEnergySummary(); } // kept for compat

// ── EXPORT ──
function exportReport() {
  var rows = [['Store','Crew','Task','Status','Shift','Submitted']];
  (db.submissions || []).forEach(function(s) {
    rows.push([s.storeName, s.crew, s.taskName, s.status, s.shift, new Date(s.submittedAt).toLocaleString('en-PH')]);
  });
  var csv = rows.map(function(r) { return r.map(function(c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
  var a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = 'alfamart-energy-report-' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
}