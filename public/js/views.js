/**
 * views.js — Alfamart Energy Checklist
 * Alfamart Energy Monitoring System
 */

// ════════════════════════════════════════════════════════
// CLOCK
// ════════════════════════════════════════════════════════
function tickClock() {
  var d = new Date(), h = d.getHours(), m = d.getMinutes(), s = d.getSeconds();
  var ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  var str = (h < 10 ? '0' + h : h) + ':' + (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s) + ' ' + ap;
  var el = document.getElementById('clock'); if (el) el.textContent = str;
}
setInterval(tickClock, 1000); tickClock();

// ════════════════════════════════════════════════════════
// THEME
// ════════════════════════════════════════════════════════
function toggleTheme() {
  var isLight = document.body.classList.toggle('light-theme');
  try { localStorage.setItem('theme', isLight ? 'light' : 'dark'); } catch(e) {}
}
// Restore saved theme
try {
  if (localStorage.getItem('theme') === 'light') document.body.classList.add('light-theme');
} catch(e) {}

// ════════════════════════════════════════════════════════
// VIEW SWITCH
// ════════════════════════════════════════════════════════
function switchView(v) {
  try {
    document.querySelectorAll('.view').forEach(function(el) {
      el.style.display = 'none';
      el.classList.remove('active');
    });
    var el = document.getElementById('view-' + v);
    if (!el) return;
    el.style.display = 'flex';
    el.classList.add('active');
    document.querySelectorAll('.view-btn').forEach(function(b, i) {
      b.classList.toggle('active', ['server', 'mobile'][i] === v);
    });
    if (v === 'server') { try { renderServer(); } catch(e) {} }
  } catch(e) { console.warn('switchView err', e); }
}

// ════════════════════════════════════════════════════════
// TOAST
// ════════════════════════════════════════════════════════
var _toastTimer = null;
function toast(msg) {
  var el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function() { el.classList.remove('show'); }, 3000);
}

// ════════════════════════════════════════════════════════
// LIGHTBOX
// ════════════════════════════════════════════════════════
function openLightbox(src) {
  var lb = document.getElementById('lightbox');
  var img = document.getElementById('lightbox-img');
  if (lb && img) { img.src = src; lb.classList.add('show'); }
}
function closeLightbox() {
  var lb = document.getElementById('lightbox');
  if (lb) lb.classList.remove('show');
}
