/**
 * electric-meter.js — Alfamart Energy Checklist
 * Electric Meter Reading Module
 *
 * Features:
 *  1. Mobile screen: take photo of meter → AI reads kWh via Anthropic vision
 *  2. Manual kWh input per store per day
 *  3. Dashboard: per-store view with day / week / month tabs + bar chart
 *  4. Fix: energy NaN bug (dashboard.js APPLIANCES vs mobile.js APPLIANCES conflict)
 *
 * Add to index.html AFTER mobile.js:
 *   <script src="/js/electric-meter.js"></script>
 *
 * Requires the Anthropic API proxy already in place (same as existing AI calls).
 * Storage: localStorage key  "emr_readings"  →  { storeId: [ {date, kwh, source, photo?, note} ] }
 */

// ════════════════════════════════════════════════════════
// ── 1. ENERGY NaN FIX
//    dashboard.js calcKwhDay uses a.hrs  but mobile.js
//    APPLIANCES uses a.hours  → patch calcKwhDay to
//    handle both property names.
// ════════════════════════════════════════════════════════
(function patchCalcKwhDay() {
  var orig = window.calcKwhDay;
  window.calcKwhDay = function(a) {
    if (!a) return 0;
    var hrs = (a.hrs !== undefined) ? a.hrs : (a.hours !== undefined ? a.hours : 0);
    var kw  = a.kw || 0;
    return kw * hrs;
  };
})();

// ════════════════════════════════════════════════════════
// ── 2. STORAGE HELPERS
// ════════════════════════════════════════════════════════
var EMR_KEY = 'emr_readings';

function emrLoad() {
  try { return JSON.parse(localStorage.getItem(EMR_KEY) || '{}'); } catch(e) { return {}; }
}

function emrSave(data) {
  try { localStorage.setItem(EMR_KEY, JSON.stringify(data)); } catch(e) {}
}

function emrGetStore(storeId) {
  return (emrLoad()[storeId] || []).sort(function(a,b){ return a.date < b.date ? -1 : 1; });
}

function emrAddReading(storeId, date, kwh, source, photo, note) {
  var data = emrLoad();
  if (!data[storeId]) data[storeId] = [];
  // Remove existing entry for same date
  data[storeId] = data[storeId].filter(function(r){ return r.date !== date; });
  data[storeId].push({ date: date, kwh: parseFloat(kwh), source: source || 'manual', photo: photo || null, note: note || '' });
  emrSave(data);
}

function emrDeleteReading(storeId, date) {
  var data = emrLoad();
  if (data[storeId]) data[storeId] = data[storeId].filter(function(r){ return r.date !== date; });
  emrSave(data);
}

// ════════════════════════════════════════════════════════
// ── 3. MOBILE SCREEN STATE
// ════════════════════════════════════════════════════════
var emrState = {
  view: 'input',        // 'input' | 'history'
  rangeTab: 'month',    // 'month' only
  selectedDate: new Date().toISOString().slice(0,10),
  pendingPhoto: null,   // base64
  pendingKwh: '',
  pendingNote: '',
  aiLoading: false,
  aiError: '',
  editing: null,        // date string of record being edited
};

// ════════════════════════════════════════════════════════
// ── 4. INJECT MOBILE SCREEN + NAV BUTTON
// ════════════════════════════════════════════════════════
(function injectMeterScreen() {
  // Add screen HTML inside .m-app
  var mApp = document.querySelector('.m-app');
  if (!mApp) { setTimeout(injectMeterScreen, 300); return; }

  // Add the screen div
  var screen = document.createElement('div');
  screen.className = 'm-screen';
  screen.id = 'm-s-meter';
  screen.innerHTML = [
    '<div class="m-head" id="emr-head">',
    '  <div class="m-head-top">',
    '    <div class="m-logo">ALFA<br>MART</div>',
    '    <div class="m-head-titles">',
    '      <div class="m-store" id="emr-store-lbl">Meter Readings</div>',
    '      <div class="m-head-sub">⚡ Electric Meter Log</div>',
    '    </div>',
    '    <button onclick="emrToggleView()" class="m-bell" id="emr-view-btn" aria-label="Toggle view" title="Toggle input / history">',
    '      📋',
    '    </button>',
    '  </div>',
    '  <!-- Range tabs (history only) -->',
    '  <div id="emr-range-tabs" style="display:none;gap:4px;margin-top:8px">',
    '    <button class="emr-tab active" id="emr-tab-month" onclick="emrSetTab(\'month\')">Monthly</button>',
    '  </div>',
    '</div>',

    '<!-- INPUT VIEW -->',
    '<div id="emr-input-view" style="flex:1;overflow-y:auto;padding:12px;-webkit-overflow-scrolling:touch">',

    '  <!-- Date selector -->',
    '  <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--rs);padding:10px 12px;margin-bottom:10px">',
    '    <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px">Reading Date</div>',
    '    <input type="date" id="emr-date-inp" onchange="emrState.selectedDate=this.value;emrRenderInput()"',
    '      style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:7px;padding:9px 10px;',
    '             font-size:15px;color:var(--text);font-family:var(--mono);font-weight:600;outline:none;',
    '             transition:border-color .15s;box-sizing:border-box">',
    '  </div>',

    '  <!-- Photo capture area -->',
    '  <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--rs);padding:12px;margin-bottom:10px">',
    '    <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">📷 Meter Photo (optional — AI reads kWh)</div>',
    '    <div id="emr-photo-area" class="photo-area" style="margin-bottom:0;position:relative;overflow:hidden">',
    '      <input type="file" id="emr-file-inp" accept="image/*" capture="environment" onchange="emrHandlePhoto(event)" style="position:absolute;top:0;left:0;width:100%;height:100%;opacity:0;cursor:pointer;z-index:10">',
    '      <div id="emr-photo-preview" style="display:none">',
    '        <img id="emr-thumb" style="width:100%;max-height:180px;object-fit:cover;border-radius:6px;display:block">',
    '        <button onclick="event.stopPropagation();emrClearPhoto()" style="margin-top:6px;width:100%;padding:7px;border:1px solid var(--border);border-radius:6px;background:var(--bg3);color:var(--text2);font-size:12px;font-weight:600;cursor:pointer;font-family:var(--font)">✕ Remove Photo</button>',
    '      </div>',
    '      <div id="emr-photo-placeholder">',
    '        <div class="photo-area-icon">📷</div>',
    '        <div class="photo-area-lbl">Tap to photograph electric meter</div>',
    '        <div style="font-size:10px;color:var(--text3);margin-top:3px">AI will extract the kWh reading</div>',
    '      </div>',
    '    </div>',
    '  </div>',

    '  <!-- AI result banner -->',
    '  <div id="emr-ai-banner" style="display:none;background:var(--bg2);border:1px solid var(--border);border-radius:var(--rs);padding:10px 12px;margin-bottom:10px">',
    '    <div id="emr-ai-msg" style="font-size:13px;color:var(--text2)"></div>',
    '  </div>',

    '  <!-- Manual kWh input -->',
    '  <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--rs);padding:12px;margin-bottom:10px">',
    '    <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">⚡ kWh Reading</div>',
    '    <div style="display:flex;align-items:center;gap:8px">',
    '      <input type="number" id="emr-kwh-inp" placeholder="0.00" step="0.01" min="0"',
    '        oninput="emrState.pendingKwh=this.value"',
    '        style="flex:1;background:var(--bg3);border:1px solid var(--border);border-radius:7px;',
    '               padding:10px 12px;font-size:20px;font-family:var(--mono);font-weight:700;',
    '               color:var(--text);outline:none;transition:border-color .15s">',
    '      <span style="font-size:14px;font-weight:700;color:var(--text3);white-space:nowrap">kWh</span>',
    '    </div>',
    '    <div id="emr-prev-diff" style="font-size:11px;color:var(--text3);margin-top:6px"></div>',
    '  </div>',

    '  <!-- Note -->',
    '  <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--rs);padding:12px;margin-bottom:14px">',
    '    <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px">Note (optional)</div>',
    '    <textarea id="emr-note-inp" rows="2" placeholder="Remarks, anomalies..." oninput="emrState.pendingNote=this.value"',
    '      class="remark-inp" style="width:100%;margin-bottom:0;box-sizing:border-box"></textarea>',
    '  </div>',

    '  <!-- Existing reading notice -->',
    '  <div id="emr-existing-notice" style="display:none;background:var(--amber-bg);border:1px solid var(--amber-b);border-radius:var(--rs);padding:10px 12px;margin-bottom:10px;font-size:12px;color:var(--amber);font-weight:600">',
    '    ⚠ A reading already exists for this date — submitting will overwrite it.',
    '  </div>',

    '  <!-- Submit -->',
    '  <button onclick="emrSubmit()" id="emr-submit-btn" class="submit-btn" style="margin-bottom:8px">',
    '    💾 Save Meter Reading',
    '  </button>',
    '</div>',

    '<!-- HISTORY VIEW -->',
    '<div id="emr-history-view" style="display:none;flex:1;overflow-y:auto;padding:12px;-webkit-overflow-scrolling:touch">',
    '  <!-- Store selector -->',
    '  <div id="emr-store-selector" style="margin-bottom:10px"></div>',
    '  <!-- Stats row -->',
    '  <div id="emr-stats-row" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px"></div>',
    '  <!-- Chart -->',
    '  <div id="emr-chart-wrap" style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--rs);padding:12px;margin-bottom:10px;overflow:hidden">',
    '    <canvas id="emr-chart" style="width:100%;display:block"></canvas>',
    '  </div>',
    '  <!-- Records table -->',
    '  <div id="emr-records" style="margin-bottom:4px"></div>',
    '</div>',
  ].join('\n');

  // Insert before .m-bottom
  var mBottom = mApp.querySelector('.m-bottom');
  mApp.insertBefore(screen, mBottom);

  // Add nav button (meter)
  var meterBtn = document.createElement('button');
  meterBtn.className = 'm-nav';
  meterBtn.id = 'mn-meter';
  meterBtn.setAttribute('onclick', "mNav('meter')");
  meterBtn.innerHTML = '<span class="m-nav-icon">⚡</span><span>Meter</span>';
  mBottom.appendChild(meterBtn);

  // Add CSS for tabs
  var style = document.createElement('style');
  style.textContent = [
    '.emr-tab{flex:1;padding:6px 4px;border:1px solid var(--border);border-radius:7px;',
    'background:transparent;color:var(--text2);font-size:12px;font-weight:600;font-family:var(--font);',
    'cursor:pointer;transition:all .15s}',
    '.emr-tab.active{background:var(--red-bg);border-color:var(--red-b);color:var(--red)}',
    '#emr-range-tabs{display:flex}',
    '#emr-kwh-inp:focus{border-color:var(--red)!important}',
    '#emr-date-inp:focus{border-color:var(--red)!important}',
    '.emr-record{background:var(--bg2);border:1px solid var(--border);border-radius:var(--rs);',
    'padding:10px 12px;margin-bottom:6px;animation:fadeIn .2s ease}',
    '.emr-record-head{display:flex;align-items:center;gap:8px;margin-bottom:4px}',
    '.emr-record-date{font-size:13px;font-weight:700;font-family:var(--mono);flex:1}',
    '.emr-record-kwh{font-size:16px;font-weight:800;font-family:var(--mono);color:var(--blue)}',
    '.emr-record-meta{font-size:11px;color:var(--text3);display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
    '.emr-pill{display:inline-flex;align-items:center;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:600}',
    '.emr-pill-ai{background:rgba(59,158,255,.12);color:#3B9EFF}',
    '.emr-pill-manual{background:var(--bg3);color:var(--text3)}',
    '.emr-bar-item{display:flex;align-items:center;gap:6px;margin-bottom:4px}',
    '.emr-bar-lbl{font-size:10px;color:var(--text3);width:36px;text-align:right;flex-shrink:0;font-family:var(--mono)}',
    '.emr-bar-track{flex:1;height:14px;background:var(--bg3);border-radius:4px;overflow:hidden}',
    '.emr-bar-fill{height:14px;background:var(--blue);border-radius:4px;transition:width .4s}',
    '.emr-bar-val{font-size:10px;font-weight:700;font-family:var(--mono);color:var(--blue);width:48px;text-align:right;flex-shrink:0}',
    '.emr-stat-card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--rs);padding:10px 12px}',
    '.emr-stat-lbl{font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px}',
    '.emr-stat-val{font-size:22px;font-weight:800;font-family:var(--mono)}',
    '.emr-stat-sub{font-size:11px;color:var(--text2);margin-top:2px}',
    '@keyframes emr-spin{to{transform:rotate(360deg)}}',
  ].join('');
  document.head.appendChild(style);

  // Patch mNav to include 'meter'
  var origMNav = window.mNav;
  window.mNav = function(screen) {
    var screens = ['checklist','temp','history','meter'];
    screens.forEach(function(s) {
      var el = document.getElementById('m-s-'+s);
      var btn = document.getElementById('mn-'+s);
      if (el) el.classList.toggle('active', s === screen);
      if (btn) btn.classList.toggle('active', s === screen);
    });
    if (screen === 'temp') { try { renderMobileTemp(); } catch(e){} }
    if (screen === 'history') { try { renderMobileHistory(); } catch(e){} }
    if (screen === 'meter') { emrRenderMobile(); }
  };

  // Initialize
  setTimeout(emrInit, 200);
})();

// ════════════════════════════════════════════════════════
// ── 5. INIT
// ════════════════════════════════════════════════════════
function emrInit() {
  var dateInp = document.getElementById('emr-date-inp');
  if (dateInp) dateInp.value = emrState.selectedDate;
  emrUpdateStoreLbl();
}

function emrUpdateStoreLbl() {
  var lbl = document.getElementById('emr-store-lbl');
  if (!lbl) return;
  var store = emrCurrentStore();
  lbl.textContent = store ? store.name : 'Meter Readings';
}

function emrCurrentStore() {
  if (!window.currentUser) return null;
  var stores = (window.db && window.db.stores) || [];
  if (currentUser.storeId) return stores.find(function(s){ return s.id === currentUser.storeId; }) || null;
  return stores[0] || null;
}

// ════════════════════════════════════════════════════════
// ── 6. VIEW TOGGLE
// ════════════════════════════════════════════════════════
function emrToggleView() {
  emrState.view = emrState.view === 'input' ? 'history' : 'input';
  emrRenderMobile();
}

function emrSetTab(tab) {
  emrState.rangeTab = tab;
  ['month'].forEach(function(t) {
    var el = document.getElementById('emr-tab-'+t);
    if (el) el.classList.toggle('active', t === tab);
  });
  emrRenderHistory();
}

// ════════════════════════════════════════════════════════
// ── 7. RENDER MOBILE SCREEN
// ════════════════════════════════════════════════════════
function emrRenderMobile() {
  emrUpdateStoreLbl();
  var inputView   = document.getElementById('emr-input-view');
  var historyView = document.getElementById('emr-history-view');
  var rangeTabs   = document.getElementById('emr-range-tabs');
  var viewBtn     = document.getElementById('emr-view-btn');
  if (!inputView || !historyView) return;

  if (emrState.view === 'input') {
    inputView.style.display  = 'block';
    historyView.style.display= 'none';
    rangeTabs.style.display  = 'none';
    if (viewBtn) viewBtn.textContent = '📋';
    emrRenderInput();
  } else {
    inputView.style.display  = 'none';
    historyView.style.display= 'block';
    rangeTabs.style.display  = 'flex';
    if (viewBtn) viewBtn.textContent = '✏️';
    emrRenderHistory();
  }
}

// ════════════════════════════════════════════════════════
// ── 8. RENDER INPUT FORM
// ════════════════════════════════════════════════════════
function emrRenderInput() {
  var store = emrCurrentStore();
  if (!store) return;
  var storeId = store.id;
  var date    = emrState.selectedDate;
  var records = emrGetStore(storeId);
  var existing = records.find(function(r){ return r.date === date; });

  // Date input
  var dateInp = document.getElementById('emr-date-inp');
  if (dateInp) dateInp.value = date;

  // kWh input (prefill if existing)
  var kwhInp = document.getElementById('emr-kwh-inp');
  if (kwhInp && existing && !emrState.pendingKwh) {
    kwhInp.value = existing.kwh;
    emrState.pendingKwh = String(existing.kwh);
  }

  // Previous reading diff
  var prevDiff = document.getElementById('emr-prev-diff');
  if (prevDiff) {
    var sorted = records.filter(function(r){ return r.date < date; });
    var prev = sorted.length ? sorted[sorted.length-1] : null;
    if (prev && emrState.pendingKwh) {
      var curr = parseFloat(emrState.pendingKwh);
      var diff = curr - prev.kwh;
      var METER_MAX = 99999.9;
      var isRollover = diff < 0 && (METER_MAX - prev.kwh + curr) < 5000;
      var isError    = diff < 0 && !isRollover;
      var diffColor, diffLabel, diffNote;
      if (isRollover) {
        var adjustedDiff = METER_MAX - prev.kwh + curr;
        diffColor = 'var(--amber)';
        diffLabel = '+' + adjustedDiff.toFixed(1) + ' kWh (meter rollover detected)';
        diffNote  = '⚠ Meter rolled over from ' + prev.kwh + ' → 0 → ' + curr;
      } else if (isError) {
        diffColor = 'var(--red)';
        diffLabel = diff.toFixed(1) + ' kWh';
        diffNote  = '🚨 Reading is lower than previous — possible meter error or wrong entry';
      } else {
        diffColor = diff > 0 ? 'var(--blue)' : 'var(--text3)';
        diffLabel = (diff >= 0 ? '+' : '') + diff.toFixed(1) + ' kWh consumed';
        diffNote  = null;
      }
      prevDiff.innerHTML = 'vs previous (' + prev.date + '): <b style="color:' + diffColor + '">' + diffLabel + '</b>' +
        (diffNote ? '<br><span style="color:' + diffColor + ';font-size:10px">' + diffNote + '</span>' : '');
    } else if (prev) {
      prevDiff.textContent = 'Previous reading: ' + prev.kwh + ' kWh on ' + prev.date;
    } else {
      prevDiff.textContent = 'No previous reading found.';
    }
  }

  // Existing notice
  var notice = document.getElementById('emr-existing-notice');
  if (notice) notice.style.display = existing ? 'block' : 'none';
}

// ════════════════════════════════════════════════════════
// ── 9. PHOTO HANDLING + AI OCR
// ════════════════════════════════════════════════════════
function emrHandlePhoto(event) {
  var file = event.target.files && event.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    emrState.pendingPhoto = e.target.result; // full data URL
    // Show preview
    var thumb = document.getElementById('emr-thumb');
    var preview = document.getElementById('emr-photo-preview');
    var placeholder = document.getElementById('emr-photo-placeholder');
    if (thumb) thumb.src = e.target.result;
    if (preview) preview.style.display = 'block';
    if (placeholder) placeholder.style.display = 'none';
    // Run AI OCR
    emrRunAiOcr(e.target.result);
  };
  reader.readAsDataURL(file);
}

function emrClearPhoto() {
  emrState.pendingPhoto = null;
  var preview = document.getElementById('emr-photo-preview');
  var placeholder = document.getElementById('emr-photo-placeholder');
  var fileInp = document.getElementById('emr-file-inp');
  if (preview) preview.style.display = 'none';
  if (placeholder) placeholder.style.display = 'block';
  if (fileInp) fileInp.value = '';
  emrHideAiBanner();
}

function emrShowAiBanner(msg, color) {
  var banner = document.getElementById('emr-ai-banner');
  var msgEl  = document.getElementById('emr-ai-msg');
  if (!banner || !msgEl) return;
  msgEl.innerHTML = msg;
  msgEl.style.color = color || 'var(--text2)';
  banner.style.display = 'block';
}

function emrHideAiBanner() {
  var banner = document.getElementById('emr-ai-banner');
  if (banner) banner.style.display = 'none';
}

function emrRunAiOcr(dataUrl) {
  emrState.aiLoading = true;
  emrShowAiBanner('<span style="display:inline-flex;align-items:center;gap:6px"><span style="display:inline-block;width:14px;height:14px;border:2px solid var(--blue);border-top-color:transparent;border-radius:50%;animation:emr-spin .7s linear infinite"></span> Reading meter with AI…</span>', 'var(--blue)');

  // Extract base64 from data URL
  var parts = dataUrl.split(',');
  var mimeMatch = parts[0].match(/:(.*?);/);
  var mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  var base64Data = parts[1];

  // Proxy through local server — keeps API key safe and works in APK (no CORS issues)
  var apiBase = (window.location.origin || '');
  fetch(apiBase + '/atp/api/ai-ocr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-App-Token': 'alfamart-2026' },
    body: JSON.stringify({ imageBase64: base64Data, mediaType: mime })
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    emrState.aiLoading = false;
    var text = '';
    if (data.content && data.content[0] && data.content[0].type === 'text') {
      text = data.content[0].text.trim();
    }
    var parsed;
    try { parsed = JSON.parse(text.replace(/```json|```/g,'')); } catch(e) { parsed = null; }

    if (parsed && parsed.kwh !== null && !isNaN(parsed.kwh)) {
      var confidence = parsed.confidence || 'medium';
      var confColor = confidence === 'high' ? 'var(--green)' : confidence === 'medium' ? 'var(--amber)' : 'var(--red)';
      emrShowAiBanner(
        '✅ AI read: <b style="font-size:15px;font-family:var(--mono);color:var(--blue)">' + parsed.kwh + ' kWh</b>' +
        ' &nbsp;<span style="font-size:10px;color:' + confColor + ';font-weight:700">' + confidence.toUpperCase() + ' confidence</span>' +
        (parsed.note ? '<br><span style="font-size:11px;color:var(--text3)">' + parsed.note + '</span>' : ''),
        'var(--green)'
      );
      // Auto-fill the kWh input
      var kwhInp = document.getElementById('emr-kwh-inp');
      if (kwhInp) { kwhInp.value = parsed.kwh; emrState.pendingKwh = String(parsed.kwh); }
      emrRenderInput(); // refresh diff
    } else {
      var note = (parsed && parsed.note) ? parsed.note : 'Could not extract reading — please enter manually.';
      emrShowAiBanner('⚠ ' + note, 'var(--amber)');
    }
  })
  .catch(function(err) {
    emrState.aiLoading = false;
    var msg = '⚠ AI read failed — please enter kWh manually.';
    // Give a more helpful hint depending on the error type
    if (err && (err.message || '').toLowerCase().indexOf('network') !== -1) {
      msg = '⚠ No network — AI unavailable. Enter kWh manually below.';
    } else if (err && (err.message || '').toLowerCase().indexOf('401') !== -1) {
      msg = '⚠ API key not configured. Enter kWh manually below.';
    }
    emrShowAiBanner(
      msg +
      '<br><span style="font-size:11px;color:var(--text3)">Type the meter value in the ⚡ kWh Reading field and tap 💾 Save.</span>',
      'var(--amber)'
    );
    // Focus the manual input so the user can type immediately
    try {
      var kwhInp = document.getElementById('emr-kwh-inp');
      if (kwhInp) { setTimeout(function(){ kwhInp.focus(); }, 100); }
    } catch(e2) {}
  });
}

// ════════════════════════════════════════════════════════
// ── 10. SUBMIT READING
// ════════════════════════════════════════════════════════
function emrSubmit() {
  var store = emrCurrentStore();
  if (!store) { alert('No store found.'); return; }
  var kwh = parseFloat(document.getElementById('emr-kwh-inp').value);
  if (isNaN(kwh) || kwh < 0) { alert('Please enter a valid kWh value.'); return; }
  var date = emrState.selectedDate || new Date().toISOString().slice(0,10);
  var note = (document.getElementById('emr-note-inp') || {}).value || '';
  var src  = emrState.pendingPhoto ? 'photo' : 'manual';
  emrAddReading(store.id, date, kwh, src, emrState.pendingPhoto, note);

  // Reset form
  emrState.pendingKwh = '';
  emrState.pendingPhoto = null;
  emrState.pendingNote = '';
  var kwhInp = document.getElementById('emr-kwh-inp');
  if (kwhInp) kwhInp.value = '';
  var noteInp = document.getElementById('emr-note-inp');
  if (noteInp) noteInp.value = '';
  emrClearPhoto();
  emrHideAiBanner();

  try { toast('✅ Meter reading saved for ' + date); } catch(e){}
  emrRenderInput();
  // Also refresh server dashboard if visible
  try { renderEnergySummaryDashboard(); } catch(e){}
}

// ════════════════════════════════════════════════════════
// ── 11. HISTORY VIEW
// ════════════════════════════════════════════════════════
var emrHistStoreId = null; // which store to show in history (admin can switch)

function emrRenderHistory() {
  var store = emrCurrentStore();
  if (!store) return;

  // For crew: locked to their store. For admin: can pick any store.
  var stores = (window.db && window.db.stores) || [];
  var isAdmin = window.currentUser && (currentUser.role === 'admin' || currentUser.role === 'manager');

  if (!emrHistStoreId) emrHistStoreId = store.id;
  var activeStoreId = isAdmin ? emrHistStoreId : store.id;

  // Store selector (admin only)
  var sel = document.getElementById('emr-store-selector');
  if (sel) {
    if (isAdmin && stores.length > 1) {
      var sHtml = '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:4px">';
      stores.forEach(function(s) {
        var act = s.id === activeStoreId;
        sHtml += '<button onclick="emrHistStoreId=\'' + s.id + '\';emrRenderHistory()" style="' +
          'padding:5px 10px;border:1px solid ' + (act?'var(--red-b)':'var(--border)') + ';' +
          'border-radius:20px;background:' + (act?'var(--red-bg)':'var(--bg2)') + ';' +
          'color:' + (act?'var(--red)':'var(--text2)') + ';font-size:11px;font-weight:600;cursor:pointer;font-family:var(--font)">' +
          (s.storeNo||s.id) + '</button>';
      });
      sHtml += '</div>';
      sel.innerHTML = sHtml;
    } else {
      sel.innerHTML = '';
    }
  }

  var records = emrGetStore(activeStoreId);
  var now = new Date();
  var today = now.toISOString().slice(0,10);

  // Filter records — month only
  var monthAgo = new Date(now.getFullYear(), now.getMonth()-1, now.getDate()).toISOString().slice(0,10);
  var filtered = records.filter(function(r){ return r.date >= monthAgo && r.date <= today; });
  var rangeLabel = 'Last 30 Days';

  var activeStore = stores.find(function(s){ return s.id === activeStoreId; }) || {};

  // Stat cards
  var totalKwh  = filtered.reduce(function(s,r){ return s + r.kwh; }, 0);
  var avgKwh    = filtered.length ? (totalKwh / filtered.length) : 0;
  var totalCost = totalKwh * (window.MERALCO_RATE || 14.3345);
  var maxR      = filtered.reduce(function(best, r){ return (!best || r.kwh > best.kwh) ? r : best; }, null);

  var statsRow = document.getElementById('emr-stats-row');
  if (statsRow) {
    statsRow.innerHTML = [
      '<div class="emr-stat-card">',
      '  <div class="emr-stat-lbl">Total kWh</div>',
      '  <div class="emr-stat-val" style="color:var(--blue)">' + totalKwh.toFixed(1) + '</div>',
      '  <div class="emr-stat-sub">' + rangeLabel + ' · ' + filtered.length + ' readings</div>',
      '</div>',
      '<div class="emr-stat-card">',
      '  <div class="emr-stat-lbl">Est. Cost</div>',
      '  <div class="emr-stat-val" style="color:var(--amber)">₱' + totalCost.toFixed(0) + '</div>',
      '  <div class="emr-stat-sub">@ ₱' + (window.MERALCO_RATE || 14.3345).toFixed(4) + '/kWh</div>',
      '</div>',
      '<div class="emr-stat-card">',
      '  <div class="emr-stat-lbl">Avg / Day</div>',
      '  <div class="emr-stat-val" style="color:var(--green)">' + avgKwh.toFixed(1) + '</div>',
      '  <div class="emr-stat-sub">kWh per day</div>',
      '</div>',
      '<div class="emr-stat-card">',
      '  <div class="emr-stat-lbl">Peak Day</div>',
      '  <div class="emr-stat-val" style="color:var(--red);font-size:18px">' + (maxR ? maxR.kwh.toFixed(1) : '—') + '</div>',
      '  <div class="emr-stat-sub">' + (maxR ? maxR.date : 'No data') + '</div>',
      '</div>',
    ].join('');
  }

  // Bar chart (canvas-free, CSS bars)
  var chartWrap = document.getElementById('emr-chart-wrap');
  if (chartWrap) {
    var chartRecords = filtered.slice(-14); // last 14 records
    if (chartRecords.length === 0) {
      chartWrap.innerHTML = '<div style="text-align:center;font-size:12px;color:var(--text3);padding:16px 0">No readings in this range.<br>Go to ✏️ Input to add readings.</div>';
    } else {
      var maxKwh = Math.max.apply(null, chartRecords.map(function(r){ return r.kwh; }));
      var barsHtml = '<div style="font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px">kWh — ' + (activeStore.storeNo ? '#' + activeStore.storeNo + ' ' : '') + rangeLabel + '</div>';
      chartRecords.forEach(function(r) {
        var pct = maxKwh > 0 ? (r.kwh / maxKwh * 100) : 0;
        var dayLbl = r.date.slice(5); // MM-DD
        var barColor = pct >= 90 ? 'var(--red)' : pct >= 70 ? 'var(--amber)' : 'var(--blue)';
        barsHtml += '<div class="emr-bar-item">';
        barsHtml += '<div class="emr-bar-lbl">' + dayLbl + '</div>';
        barsHtml += '<div class="emr-bar-track"><div class="emr-bar-fill" style="width:' + pct.toFixed(1) + '%;background:' + barColor + '"></div></div>';
        barsHtml += '<div class="emr-bar-val">' + r.kwh.toFixed(0) + '</div>';
        barsHtml += '</div>';
      });
      chartWrap.innerHTML = barsHtml;
    }
  }

  // Records list (newest first)
  var recEl = document.getElementById('emr-records');
  if (recEl) {
    if (filtered.length === 0) {
      recEl.innerHTML = '<div style="text-align:center;font-size:12px;color:var(--text3);padding:16px">No readings yet for this range.</div>';
    } else {
      var rHtml = '<div style="font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">Reading Log</div>';
      filtered.slice().reverse().forEach(function(r) {
        var src = r.source === 'photo' ? '<span class="emr-pill emr-pill-ai">📷 AI</span>' : '<span class="emr-pill emr-pill-manual">✏️ Manual</span>';
        rHtml += '<div class="emr-record">';
        rHtml += '<div class="emr-record-head">';
        rHtml += '<div class="emr-record-date">' + r.date + '</div>';
        rHtml += src;
        rHtml += '<div class="emr-record-kwh">' + r.kwh.toFixed(1) + ' kWh</div>';
        rHtml += '</div>';
        rHtml += '<div class="emr-record-meta">';
        rHtml += '<span>₱' + (r.kwh * (window.MERALCO_RATE||14.3345)).toFixed(2) + ' est.</span>';
        if (r.note) rHtml += '<span>· ' + r.note + '</span>';
        rHtml += '<button onclick="emrDeleteConfirm(\'' + activeStoreId + '\',\'' + r.date + '\')" style="margin-left:auto;padding:2px 8px;border:1px solid var(--border);border-radius:5px;background:transparent;color:var(--text3);font-size:11px;cursor:pointer;font-family:var(--font)">🗑</button>';
        if (r.photo) rHtml += '<button onclick="openLightbox(\'' + r.photo + '\')" style="padding:2px 8px;border:1px solid var(--border);border-radius:5px;background:transparent;color:var(--blue);font-size:11px;cursor:pointer;font-family:var(--font)">🔍 Photo</button>';
        rHtml += '</div>';
        rHtml += '</div>';
      });
      recEl.innerHTML = rHtml;
    }
  }
}

function emrDeleteConfirm(storeId, date) {
  if (!confirm('Delete reading for ' + date + '?')) return;
  emrDeleteReading(storeId, date);
  emrRenderHistory();
}

// ════════════════════════════════════════════════════════
// ── 12. SERVER DASHBOARD — Per-store meter panel
//    Adds a new section to the main dashboard showing
//    actual meter readings for all stores with day/week/month tabs.
// ════════════════════════════════════════════════════════
function renderMeterDashboard() {
  var wrap = document.getElementById('meter-dashboard-wrap');
  if (!wrap) return;

  var stores = (window.db && window.db.stores) || [];
  var RATE = window.MERALCO_RATE || 14.3345;
  var now = new Date();
  var today = now.toISOString().slice(0,10);

  // Get all readings for all stores
  var allData = emrLoad();
  var hasAny = Object.keys(allData).some(function(sid) { return allData[sid] && allData[sid].length > 0; });

  var html = '';

  // Header with tabs
  html += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px">';
  html += '<div style="flex:1"></div>';
  // Month-only tab
  var act = true;
  html += '<button style="' +
    'padding:5px 13px;border:1px solid var(--blue-b,#3B9EFF);' +
    'border-radius:20px;background:rgba(59,158,255,.12);' +
    'color:#3B9EFF;font-size:11px;font-weight:600;font-family:var(--font);cursor:default">Last 30 Days</button>';
  html += '</div>';

  if (!hasAny) {
    html += '<div style="padding:24px;text-align:center;background:var(--bg2);border:1px solid var(--border);border-radius:var(--r)">';
    html += '<div style="font-size:24px;margin-bottom:8px">📱</div>';
    html += '<div style="font-size:13px;font-weight:600;margin-bottom:4px">No meter readings yet</div>';
    html += '<div style="font-size:12px;color:var(--text3)">Use the Mobile → ⚡ Meter screen to log electric meter readings per store.</div>';
    html += '</div>';
    wrap.innerHTML = html;
    return;
  }

  var tab = 'month'; // month-only view
  var weekAgo  = new Date(now.getTime() - 6*86400000).toISOString().slice(0,10);
  var monthAgo = new Date(now.getFullYear(), now.getMonth()-1, now.getDate()).toISOString().slice(0,10);

  function filterRecords(records) {
    return records.filter(function(r){ return r.date >= monthAgo && r.date <= today; });
  }

  // Grand total row
  var grandKwh = 0;
  stores.forEach(function(s) {
    var recs = filterRecords(allData[s.id] || []);
    grandKwh += recs.reduce(function(sum,r){ return sum + r.kwh; }, 0);
  });

  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-bottom:14px">';
  var grandCost = grandKwh * RATE;
  html += '<div class="stat-card"><div class="stat-lbl">Total kWh</div><div class="stat-val" style="color:var(--blue)">' + grandKwh.toFixed(1) + '</div><div class="stat-trend">All stores · ' + '30 days' + '</div></div>';
  html += '<div class="stat-card"><div class="stat-lbl">Total Cost</div><div class="stat-val" style="color:var(--amber)">₱' + Math.round(grandCost).toLocaleString() + '</div><div class="stat-trend">@ ₱' + RATE.toFixed(4) + '/kWh</div></div>';
  html += '</div>';

  // Per-store table
  html += '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);overflow:hidden;margin-bottom:16px">';
  html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">';
  html += '<thead><tr style="background:var(--bg3)">';
  ['Store','No.','Readings','kWh','Est. Cost','Avg/Day','Peak','Bar'].forEach(function(h) {
    html += '<th style="padding:9px 12px;font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.07em;text-align:left;border-bottom:1px solid var(--border);white-space:nowrap">' + h + '</th>';
  });
  html += '</tr></thead><tbody>';

  var storeKwhs = stores.map(function(s) {
    var recs = filterRecords(allData[s.id] || []);
    var kwh = recs.reduce(function(sum,r){ return sum + r.kwh; }, 0);
    return { store: s, kwh: kwh, recs: recs };
  });
  var maxStoreKwh = Math.max.apply(null, storeKwhs.map(function(x){ return x.kwh; }));

  storeKwhs.forEach(function(x, i) {
    var s = x.store;
    var recs = x.recs;
    var kwh = x.kwh;
    var cost = kwh * RATE;
    var avg = recs.length ? (kwh / recs.length) : 0;
    var peak = recs.length ? Math.max.apply(null, recs.map(function(r){ return r.kwh; })) : 0;
    var barPct = maxStoreKwh > 0 ? (kwh / maxStoreKwh * 100) : 0;
    var barColor = barPct >= 90 ? 'var(--red)' : barPct >= 60 ? 'var(--amber)' : 'var(--blue)';
    var rowBg = i%2===0 ? '' : 'background:var(--bg3)';

    html += '<tr style="' + rowBg + '">';
    html += '<td style="padding:9px 12px;font-weight:600;font-size:12px">' + s.name + '</td>';
    html += '<td style="padding:9px 12px"><span class="pill pill-blue">' + (s.storeNo||'—') + '</span></td>';
    html += '<td style="padding:9px 12px;font-family:var(--mono);color:var(--text2)">' + recs.length + '</td>';
    html += '<td style="padding:9px 12px;font-family:var(--mono);font-weight:700;color:var(--blue)">' + kwh.toFixed(1) + '</td>';
    html += '<td style="padding:9px 12px;font-family:var(--mono);color:var(--amber)">₱' + cost.toFixed(2) + '</td>';
    html += '<td style="padding:9px 12px;font-family:var(--mono);color:var(--text2)">' + avg.toFixed(1) + '</td>';
    html += '<td style="padding:9px 12px;font-family:var(--mono);color:var(--red)">' + (peak ? peak.toFixed(1) : '—') + '</td>';
    html += '<td style="padding:9px 12px;min-width:80px"><div style="height:6px;background:var(--bg4);border-radius:3px;overflow:hidden"><div style="width:' + barPct.toFixed(1) + '%;height:6px;background:' + barColor + ';border-radius:3px;transition:width .4s"></div></div></td>';
    html += '</tr>';
  });

  html += '</tbody></table></div></div>';
  wrap.innerHTML = html;
}

// ════════════════════════════════════════════════════════
// ── 13. AUTO-INJECT METER SECTION INTO SERVER DASHBOARD
// ════════════════════════════════════════════════════════
(function injectMeterDashboard() {
  function tryInject() {
    var energySec = document.getElementById('energy-summary-wrap');
    if (!energySec) { setTimeout(tryInject, 500); return; }
    // Already injected?
    if (document.getElementById('meter-dashboard-wrap')) return;

    // Insert before the energy summary wrap's parent section
    var parent = energySec.parentNode;
    if (!parent) return;

    // Create meter section elements
    var title = document.createElement('div');
    title.className = 'sec-title';
    title.innerHTML = '🔌 Electric Meter Readings (Actual kWh)';

    var wrap = document.createElement('div');
    wrap.id = 'meter-dashboard-wrap';
    wrap.style.marginBottom = '20px';

    // Insert before the energy summary title
    var energyTitle = energySec.previousElementSibling;
    if (energyTitle && energyTitle.classList.contains('sec-title')) {
      parent.insertBefore(title, energyTitle);
      parent.insertBefore(wrap, energyTitle);
    } else {
      parent.insertBefore(title, energySec);
      parent.insertBefore(wrap, energySec);
    }
  }
  setTimeout(tryInject, 600);
})();

// ════════════════════════════════════════════════════════
// ── 14. HOOK INTO renderServer TO ALSO RENDER METER PANEL
// ════════════════════════════════════════════════════════
(function patchRenderServer() {
  var orig = window.renderServer;
  window.renderServer = function() {
    if (orig) orig.apply(this, arguments);
    try { renderMeterDashboard(); } catch(e) {}
  };
})();

// ════════════════════════════════════════════════════════
// ── 15. PATCH renderEnergySummary IN dashboard.js
//    The store detail calls calcKwhDay(a) where a comes
//    from mobile.js APPLIANCES (uses a.hours, not a.hrs).
//    We already patched calcKwhDay above — this ensures
//    the stat cards in the store detail stop showing NaN.
// ════════════════════════════════════════════════════════
// No extra code needed — the calcKwhDay patch in section 1
// already fixes both dashboard.js and mobile.js usage.

// ════════════════════════════════════════════════════════
// ── 16. ALSO PATCH renderEnergySummary (dashboard.js version)
//    to use real meter data when available as a "Meralco"
//    style supplement stat. Non-destructive.
// ════════════════════════════════════════════════════════
(function patchDashboardEnergy() {
  var orig = window.renderEnergySummary;
  window.renderEnergySummaryDashboard = function() {
    try { if (orig) orig.call(this); } catch(e) {}
    try { renderMeterDashboard(); } catch(e) {}
  };
})();

console.log('[electric-meter.js] loaded — NaN fix + meter module ready');

// ════════════════════════════════════════════════════════
// ── 17. PER-STORE METER PANEL (Manager Dashboard)
//    Renders a day/week/month tabbed view of actual meter
//    readings for a single store inside renderStoreDetail.
//    Called automatically via a patch on renderStoreDetail.
// ════════════════════════════════════════════════════════

// State: which tab is active per store
var _storeMeterTab = {}; // month-only

function storeMeterSetTab(storeId, tab) {
  _storeMeterTab[storeId] = tab;
  renderStoreMeterPanel(storeId);
}

function renderStoreMeterPanel(storeId) {
  var wrap = document.getElementById('store-meter-panel-' + storeId);
  if (!wrap) return;

  var RATE = window.MERALCO_RATE || 14.3345;
  var now = new Date();
  var today = now.toISOString().slice(0, 10);
  var tab = 'month'; // month-only

  // Date boundaries
  var weekAgo  = new Date(now.getTime() - 6 * 86400000).toISOString().slice(0, 10);
  var monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()).toISOString().slice(0, 10);

  var allRecords = emrGetStore(storeId);
  var records = allRecords.filter(function(r) { return r.date >= monthAgo && r.date <= today; });
  var rangeLabel = 'Last 30 Days';

  var totalKwh = records.reduce(function(s, r) { return s + r.kwh; }, 0);
  var avgKwh   = records.length ? (totalKwh / records.length) : 0;
  var totalCost = totalKwh * RATE;
  var maxRec   = records.reduce(function(best, r) { return (!best || r.kwh > best.kwh) ? r : best; }, null);

  // Tabs HTML
  var html = '<div style="display:flex;gap:6px;margin-bottom:12px">';
  html += '<button style="padding:5px 13px;border:1px solid var(--blue-b,#3B9EFF);border-radius:20px;background:rgba(59,158,255,.12);color:#3B9EFF;font-size:11px;font-weight:600;font-family:var(--font);cursor:default">Last 30 Days</button>';
  html += '</div>';

  if (allRecords.length === 0) {
    html += '<div style="padding:20px;text-align:center;background:var(--bg2);border:1px solid var(--border);border-radius:var(--rs)">' +
      '<div style="font-size:20px;margin-bottom:6px">📱</div>' +
      '<div style="font-size:12px;font-weight:600;margin-bottom:3px">No meter readings yet</div>' +
      '<div style="font-size:11px;color:var(--text3)">Use Mobile → ⚡ Meter to log readings for this store.</div>' +
      '</div>';
    wrap.innerHTML = html;
    return;
  }

  // Stat cards (4 across)
  html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px">';
  html += '<div class="kwh-stat"><div class="kwh-stat-lbl">Total kWh</div><div class="kwh-stat-val" style="color:var(--blue)">' + totalKwh.toFixed(1) + '</div><div class="kwh-stat-sub">' + rangeLabel + ' · ' + records.length + ' entries</div></div>';
  html += '<div class="kwh-stat"><div class="kwh-stat-lbl">Est. Cost</div><div class="kwh-stat-val" style="color:var(--amber)">₱' + totalCost.toFixed(2) + '</div><div class="kwh-stat-sub">@ ₱' + RATE.toFixed(4) + '/kWh</div></div>';
  html += '<div class="kwh-stat"><div class="kwh-stat-lbl">Avg / Entry</div><div class="kwh-stat-val" style="color:var(--green)">' + avgKwh.toFixed(1) + '</div><div class="kwh-stat-sub">kWh</div></div>';
  html += '<div class="kwh-stat"><div class="kwh-stat-lbl">Peak Day</div><div class="kwh-stat-val" style="color:var(--red);font-size:16px">' + (maxRec ? maxRec.kwh.toFixed(1) : '—') + '</div><div class="kwh-stat-sub">' + (maxRec ? maxRec.date : 'No data') + '</div></div>';
  html += '</div>';

  // Bar chart (CSS bars, newest first, last 14)
  var chartRecs = records.slice(-14);
  if (chartRecs.length > 0) {
    var maxKwh = Math.max.apply(null, chartRecs.map(function(r) { return r.kwh; }));
    html += '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--rs);padding:12px;margin-bottom:10px">';
    html += '<div style="font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px">⚡ Meter Reading Trend — ' + rangeLabel + '</div>';
    chartRecs.forEach(function(r) {
      var pct = maxKwh > 0 ? (r.kwh / maxKwh * 100) : 0;
      var barColor = pct >= 90 ? 'var(--red)' : pct >= 60 ? 'var(--amber)' : 'var(--blue)';
      var src = r.source === 'photo' ? '📷' : '✏';
      html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">';
      html += '<div style="font-size:10px;color:var(--text3);width:52px;text-align:right;flex-shrink:0;font-family:var(--mono)">' + r.date.slice(5) + '</div>';
      html += '<div style="flex:1;height:14px;background:var(--bg3);border-radius:4px;overflow:hidden"><div style="width:' + pct.toFixed(1) + '%;height:14px;background:' + barColor + ';border-radius:4px;transition:width .4s"></div></div>';
      html += '<div style="font-size:10px;font-weight:700;font-family:var(--mono);color:' + barColor + ';width:52px;text-align:right;flex-shrink:0">' + r.kwh.toFixed(1) + ' kWh</div>';
      html += '<div style="font-size:10px;color:var(--text3);width:16px;text-align:center;flex-shrink:0" title="' + (r.source === 'photo' ? 'AI from photo' : 'Manual entry') + '">' + src + '</div>';
      html += '</div>';
    });
    html += '</div>';
  }

  // Records table (newest first)
  if (records.length > 0) {
    html += '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--rs);overflow:hidden">';
    html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">';
    html += '<thead><tr style="background:var(--bg3)">';
    ['Date', 'kWh', 'Cost (₱)', 'Source', 'Note', ''].forEach(function(h) {
      html += '<th style="padding:8px 12px;font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.07em;text-align:left;border-bottom:1px solid var(--border);white-space:nowrap">' + h + '</th>';
    });
    html += '</tr></thead><tbody>';
    records.slice().reverse().forEach(function(r, i) {
      var rowBg = i % 2 === 0 ? '' : 'background:var(--bg3)';
      var srcPill = r.source === 'photo'
        ? '<span style="padding:2px 7px;border-radius:10px;background:rgba(59,158,255,.12);color:#3B9EFF;font-size:10px;font-weight:600">📷 AI</span>'
        : '<span style="padding:2px 7px;border-radius:10px;background:var(--bg3);color:var(--text3);font-size:10px;font-weight:600">✏ Manual</span>';
      var photoBtn = r.photo
        ? '<button onclick="openLightbox(\'' + r.photo + '\')" style="padding:2px 7px;border:1px solid var(--border);border-radius:5px;background:transparent;color:var(--blue);font-size:10px;cursor:pointer;font-family:var(--font)">🔍</button> '
        : '';
      html += '<tr style="' + rowBg + '">';
      html += '<td style="padding:8px 12px;font-family:var(--mono);font-weight:700;white-space:nowrap">' + r.date + '</td>';
      html += '<td style="padding:8px 12px;font-family:var(--mono);font-weight:700;color:var(--blue)">' + r.kwh.toFixed(2) + '</td>';
      html += '<td style="padding:8px 12px;font-family:var(--mono);color:var(--amber)">₱' + (r.kwh * RATE).toFixed(2) + '</td>';
      html += '<td style="padding:8px 12px">' + srcPill + '</td>';
      html += '<td style="padding:8px 12px;color:var(--text2);font-size:11px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (r.note || '—') + '</td>';
      html += '<td style="padding:8px 12px">' + photoBtn +
        '<button onclick="emrDeleteConfirm(\'' + storeId + '\',\'' + r.date + '\')" style="padding:2px 7px;border:1px solid var(--border);border-radius:5px;background:transparent;color:var(--text3);font-size:10px;cursor:pointer;font-family:var(--font)">🗑</button></td>';
      html += '</tr>';
    });
    html += '</tbody></table></div></div>';
  } else {
    html += '<div style="padding:16px;text-align:center;background:var(--bg2);border:1px solid var(--border);border-radius:var(--rs);font-size:12px;color:var(--text3)">No readings in this range.</div>';
  }

  wrap.innerHTML = html;
}

// Patch renderStoreDetail to inject the meter panel
(function patchRenderStoreDetail() {
  function tryPatch() {
    if (typeof window.renderStoreDetail !== 'function') {
      setTimeout(tryPatch, 400);
      return;
    }
    var origDetail = window.renderStoreDetail;
    window.renderStoreDetail = function(storeId) {
      // Call original first
      origDetail.apply(this, arguments);

      // After render, inject our meter panel if not already there
      var content = document.getElementById('store-detail-content');
      if (!content) return;
      var panelId = 'store-meter-panel-' + storeId;
      if (document.getElementById(panelId)) {
        // Already injected — just refresh data
        renderStoreMeterPanel(storeId);
        return;
      }

      // Build wrapper section
      var secTitle = document.createElement('div');
      secTitle.className = 'sec-title';
      secTitle.innerHTML = '🔌 Electric Meter Readings';
      secTitle.style.marginTop = '20px';

      var wrap = document.createElement('div');
      wrap.id = panelId;
      wrap.style.marginBottom = '20px';

      content.appendChild(secTitle);
      content.appendChild(wrap);

      renderStoreMeterPanel(storeId);
    };
  }
  setTimeout(tryPatch, 700);
})();
