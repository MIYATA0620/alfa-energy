/**
 * mobile.js — Alfamart Energy Checklist
 * Alfamart Energy Monitoring System
 */

// ════════════════════════════════════════════════════════
// MOBILE INIT & RENDER
// ════════════════════════════════════════════════════════
function initMobile() {
  if(!currentUser) return;
  // Restore persisted checklist state
  loadLocalTasks();
  // Hydrate from server (mark submitted tasks as done)
  hydrateLocalTasksFromServer();
  // Move grace banner wrap into the mobile checklist view
  try {
    var slot = document.getElementById('grace-banner-slot');
    var bar = document.getElementById('grace-bar-wrap');
    if (slot && bar && slot.parentNode !== bar.parentNode) {
      slot.parentNode.insertBefore(bar, slot);
      slot.parentNode.removeChild(slot);
    }
  } catch(e) {}
  renderMobileStore();
  renderMobileChecklist();
  renderMobileTemp();
  renderMobileHistory();
}

function renderMobileStore() {
  if(!currentUser) return;
  var store=null;
  if(currentUser.storeId) store=(db.stores||[]).find(function(s){return s.id===currentUser.storeId});
  if(!store&&db.stores&&db.stores.length) store=db.stores[0];
  if(!store) return;
  var el=document.getElementById('m-store-lbl'); if(el) el.textContent=store.name;
}

function renderMobileChecklist() {
  var html=''; var totalDone=0; var totalAll=0;
  CHECKLIST.forEach(function(cat) {
    var catDone=0;
    cat.tasks.forEach(function(t){ if(localTasks[t.id]&&localTasks[t.id].done) catDone++; totalAll++; });
    totalDone+=catDone;
    var isOpen=openCats[cat.id];
    var _hasAlert = catHasActiveTasks(cat);
    html+='<div class="cat-head" onclick="toggleCat(\''+cat.id+'\')">';
    html+='<span class="cat-icon">'+cat.icon+'</span>';
    html+='<span class="cat-name">'+cat.name+'</span>'+(_hasAlert?'<span class="task-alert-dot"></span>':'');
    html+='<span class="cat-count">'+catDone+'/'+cat.tasks.length+'</span>';
    html+='<span class="cat-arrow'+(isOpen?' open':'')+'">›</span>';
    html+='</div>';
    if(isOpen) {
      cat.tasks.forEach(function(task) {
        var lt=localTasks[task.id]||{};
        var done=!!lt.done;
        html+='<div class="m-task'+(done?' done':'')+'">';
        html+='<div class="task-top">';
        html+='<div class="m-chk'+(done?' done':'')+'" onclick="toggleDone(\''+task.id+'\')">'+( done?'✓':'')+'</div>';
        var _tNow = isTaskTimeActive(task.time) && !done;
        html+='<div class="task-info">'+'<div class="task-name">'+task.name+'</div>'+'<div class="task-time" style="display:flex;align-items:center;gap:5px">🕐 '+task.time+(_tNow?'<span class="task-alert-dot"></span><span style="font-size:12px;color:var(--red);font-weight:700"> NOW</span>':'')+'</div></div>';
        html+='</div>';
        var approved = isTaskApproved(task.id);
        if(!done && !approved){
          html+='<div class="task-body">';
          html+='<div class="comp-row">';
          html+='<button class="comp-btn'+(lt.status==='yes'?' yes':'')+'" onclick="setStatus(\''+task.id+'\',\'yes\',\''+cat.id+'\')">✓ Compliant</button>';
          html+='<button class="comp-btn'+(lt.status==='no'?' no':'')+'" onclick="setStatus(\''+task.id+'\',\'no\',\''+cat.id+'\')">✗ Not Compliant</button>';
          html+='</div>';
          html+='<textarea class="remark-inp" rows="2" placeholder="Remarks..." onchange="setRemark(\''+task.id+'\',this.value)">'+( lt.remark||'')+'</textarea>';
          html+='<div class="photo-area">';
          html+='<input type="file" accept="image/*" capture="environment" onchange="handlePhoto(\''+task.id+'\',event)">';
          html+='<div class="photo-area-icon">📷</div>';
          html+='<div class="photo-area-lbl">Tap to attach photo proof</div>';
          if(lt.pics&&lt.pics.length>0){
            html+='<div class="photos-row">';
            lt.pics.forEach(function(p){ html+='<img class="photo-thumb" src="'+p+'" alt="">'; });
            html+='</div>';
          }
          html+='</div>';
          html+='<button class="submit-btn" onclick="submitTask(\''+task.id+'\',\''+cat.id+'\')"'+(lt.status?'':' disabled')+'>Submit ↑</button>';
          html+='</div>';
        }
        html+='</div>';
      });
    }
  });
  var clEl = document.getElementById('m-checklist');
  if(clEl) clEl.innerHTML = html;
  // Progress bar: use server-side count (submitted tasks) for accuracy
  var serverPct = currentUser && currentUser.storeId ? storeProgress(currentUser.storeId) : 0;
  // Fall back to local count if server hasn't synced yet
  var pct = serverPct > 0 ? serverPct : (totalAll>0 ? Math.round((totalDone/totalAll)*100) : 0);
  var displayDone = Math.round(pct * totalAll / 100);
  var pf = document.getElementById('m-prog-fill'); if(pf) pf.style.width = pct+'%';
  var pl = document.getElementById('m-pct-lbl'); if(pl) pl.textContent = pct+'%';
  var dl = document.getElementById('m-done-lbl'); if(dl) dl.textContent = displayDone+' / '+totalAll+' done';
  var mb = document.getElementById('m-task-badge'); if(mb) mb.textContent = Math.max(0, totalAll-displayDone);
}

function toggleCat(id){ openCats[id]=!openCats[id]; renderMobileChecklist(); }
function isTaskTimeActive(tl){
  var tot=new Date().getHours()*60+new Date().getMinutes();
  var t=(tl||'').toLowerCase();
  if((t.indexOf('7am')!==-1||t.indexOf('7:00')!==-1)&&tot>=300&&tot<600)return true;
  if(t.indexOf('5:40')!==-1&&tot>=1050&&tot<1140)return true;
  if((t.indexOf('12mn')!==-1||t.indexOf('12:00 mn')!==-1)&&(tot>=1410||tot<60))return true;
  if(t.indexOf('6am')!==-1&&tot>=330&&tot<420)return true;
  if(t.indexOf('10am')!==-1&&tot>=570&&tot<660)return true;
  return false;
}
function catHasActiveTasks(cat){return cat.tasks.some(function(t){return isTaskTimeActive(t.time)&&!(localTasks[t.id]&&localTasks[t.id].done);});}
function toggleDone(tid){ var lt=localTasks[tid]||{}; lt.done=!lt.done; localTasks[tid]=lt; saveLocalTasks(); renderMobileChecklist(); }
function setStatus(tid,val,cid){ var lt=localTasks[tid]||{}; lt.status=val; localTasks[tid]=lt; saveLocalTasks(); renderMobileChecklist(); }
function setRemark(tid,val){ var lt=localTasks[tid]||{}; lt.remark=val; localTasks[tid]=lt; saveLocalTasks(); }

function handlePhoto(tid,e){
  var file=e.target.files[0]; if(!file) return;
  var r=new FileReader();
  r.onload=function(ev){
    var lt=localTasks[tid]||{}; if(!lt.pics) lt.pics=[];
    lt.pics.push(ev.target.result); localTasks[tid]=lt;
    renderMobileChecklist();
  };
  r.readAsDataURL(file); e.target.value='';
}

async function submitTask(tid, catId) {
  var lt=localTasks[tid]||{};
  if(!lt.status){ toast('⚠ Mark compliant or not first'); return; }
  var store=null;
  if(currentUser.storeId) store=(db.stores||[]).find(function(s){return s.id===currentUser.storeId});
  if(!store&&db.stores&&db.stores.length) store=db.stores[0];
  var cat=CHECKLIST.find(function(c){return c.id===catId});
  var task=cat.tasks.find(function(t){return t.id===tid});
  var payload={
    storeId:store?store.id:'unknown', storeName:store?store.name:'Unknown Store',
    crew:currentUser.name, crewId:currentUser.id,
    taskId:tid, taskName:task.name, category:cat.name,
    status:lt.status, remark:lt.remark||'',
    pics:lt.pics||[], shift:store?store.storeStatus:'Opening'
  };
  var data=await apiFetch('POST','/api/submit',payload);
  if(data&&data.ok){
    lt.done=true; localTasks[tid]=lt;
    saveLocalTasks();
    await syncDB();
    renderMobileChecklist();
    renderMobileHistory();
    toast('✅ Submitted to server!');
  } else {
    offlineQueue.push(payload);
    lt.done=true; localTasks[tid]=lt;
    saveLocalTasks();
    renderMobileChecklist();
    toast('⚠ Saved offline — will sync later');
  }
}

// ── TEMPERATURE ──
function renderMobileTemp() {
  var units = getStoreTempUnits();
  var shiftLabel = getCurrentShiftLabel();
  var shift = currentTempShift || detectTempShift();
  var isLocked = isTempShiftLocked(shift);
  var body = document.getElementById('m-temp-body');
  var shiftTagEl = document.getElementById('m-temp-shift-tag');
  var statusLbl = document.getElementById('m-temp-status-lbl');
  var submitBtn = document.getElementById('m-temp-submit-btn');
  var submitWrap = document.getElementById('m-temp-submit-wrap');

  if (shiftTagEl) shiftTagEl.textContent = shiftLabel;
  if (statusLbl) statusLbl.textContent = isLocked ? '✓ Submitted' : '';

  if (!units) {
    body.innerHTML = '<div style="text-align:center;color:var(--text3);padding:32px 12px;font-size:15px">No temperature data for this store.</div>';
    return;
  }

  // Show locked state
  if (isLocked) {
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '✅ ' + shiftLabel + ' Submitted'; submitBtn.style.background='var(--green)'; }
  } else {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '📤 Submit Temperature Log'; submitBtn.style.background=''; }
  }

  var html = '';
  // Compact summary bar
  html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0 8px">';
  // count OK/bad
  var okFz=0,warnFz=0,badFz=0;
  units.freezers.forEach(function(u,i){
    var v=localTemps['fz'+i];
    if(v!==undefined&&v!==''){var n=parseFloat(v);if(n<=u.target)okFz++;else if(n<=u.target+5)warnFz++;else badFz++;}
  });
  var okCh=0,warnCh=0,badCh=0;
  units.chillers.forEach(function(u,i){
    var v=localTemps['ch'+i];
    if(v!==undefined&&v!==''){var n=parseFloat(v);if(n>=2&&n<=u.target)okCh++;else if(n<8)warnCh++;else badCh++;}
  });
  html += '<div style="display:flex;gap:6px;font-size:13px">';
  if(okFz+okCh>0) html += '<span style="color:var(--green);font-weight:600">✓ '+(okFz+okCh)+'</span>';
  if(warnFz+warnCh>0) html += '<span style="color:var(--amber);font-weight:600">⚠ '+(warnFz+warnCh)+'</span>';
  if(badFz+badCh>0) html += '<span style="color:var(--red);font-weight:600">✗ '+(badFz+badCh)+'</span>';
  html += '</div></div>';

  // ── FREEZERS ──
  html += '<div style="font-size:14px;color:var(--text2);padding:0 0 8px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase">❄️ Freezers</div>';
  units.freezers.forEach(function(u,i){
    var key = 'fz'+i;
    var val = (localTemps[key] !== undefined) ? localTemps[key] : '';
    var st='', sc='', bg='';
    if(val!==''){
      var n=parseFloat(val);
      if(n<=u.target){st='✓ OK';sc='color:var(--green)';bg='border-color:var(--green-b)';}
      else if(n<=u.target+5){st='⚠ Warm';sc='color:var(--amber)';bg='border-color:var(--amber-b)';}
      else{st='✗ Critical';sc='color:var(--red)';bg='border-color:var(--red-b)';}
    }
    html += '<div class="temp-card" style="'+bg+'">';
    html += '<div class="temp-card-head">';
    html += '<span style="width:18px;height:18px;border-radius:4px;background:var(--bg3);display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:var(--text3);flex-shrink:0">'+u.no+'</span>';
    html += '<span class="temp-card-name">'+u.name+'</span>';
    html += '<span class="temp-status" style="'+sc+';margin-left:auto">'+st+'</span>';
    html += '<div class="temp-inp-row" style="margin-top:0;margin-left:8px">';
    var disabled = isLocked ? 'disabled' : '';
    html += '<input class="temp-inp" type="number" step="0.1" value="'+val+'" placeholder="'+u.target+'" oninput="setTempDirect(this.dataset.key,this.value)" data-key="'+key+'" inputmode="decimal" '+disabled+'>';
    html += '<span style="font-size:13px;color:var(--text3)">°C</span>';
    html += '</div></div></div>';
  });

  html += '<div style="font-size:13px;color:var(--text2);padding:8px 0 5px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">🧊 Chillers</div>';
  units.chillers.forEach(function(u,i){
    var key = 'ch'+i;
    var val = (localTemps[key] !== undefined) ? localTemps[key] : '';
    var st='', sc='', bg='';
    if(val!==''){
      var n=parseFloat(val);
      if(n>=2&&n<=u.target){st='✓';sc='color:var(--green)';bg='border-color:var(--green-b)';}
      else if(n<8){st='⚠';sc='color:var(--amber)';bg='border-color:var(--amber-b)';}
      else{st='✗';sc='color:var(--red)';bg='border-color:var(--red-b)';}
    }
    html += '<div class="temp-card" style="'+bg+'">';
    html += '<div class="temp-card-head">';
    html += '<span style="width:18px;height:18px;border-radius:4px;background:var(--bg3);display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:var(--text3);flex-shrink:0">'+u.no+'</span>';
    html += '<span class="temp-card-name">'+u.name+'</span>';
    html += '<span class="temp-status" style="'+sc+';margin-left:auto">'+st+'</span>';
    html += '<div class="temp-inp-row" style="margin-top:0;margin-left:8px">';
    var disabled = isLocked ? 'disabled' : '';
    html += '<input class="temp-inp" type="number" step="0.1" value="'+val+'" placeholder="4" oninput="setTempDirect(this.dataset.key,this.value)" data-key="'+key+'" inputmode="decimal" '+disabled+'>';
    html += '<span style="font-size:13px;color:var(--text3)">°C</span>';
    html += '</div></div></div>';
  });

  if (isLocked) {
    html += '<div style="text-align:center;padding:10px;font-size:14px;color:var(--green);font-weight:600">✅ This shift has been submitted. Inputs are locked.</div>';
  }
  body.innerHTML = html;
}

// Don't re-render the whole list on every keystroke — just store the value
function setTempDirect(k, v) {
  localTemps[k] = v;
  // Only update status indicators, not the whole DOM (preserves focus)
  updateTempStatus();
}

function setTemp(k,v){ localTemps[k]=v; }

function updateTempStatus() {
  // Light update: re-render just the header summary without disrupting inputs
  var units = getStoreTempUnits();
  if (!units) return;
  var okFz=0,warnFz=0,badFz=0;
  units.freezers.forEach(function(u,i){
    var v=localTemps['fz'+i];
    if(v!==undefined&&v!==''){var n=parseFloat(v);if(n<=u.target)okFz++;else if(n<=u.target+5)warnFz++;else badFz++;}
  });
  var okCh=0,warnCh=0,badCh=0;
  units.chillers.forEach(function(u,i){
    var v=localTemps['ch'+i];
    if(v!==undefined&&v!==''){var n=parseFloat(v);if(n>=2&&n<=u.target)okCh++;else if(n<8)warnCh++;else badCh++;}
  });
}

async function submitTemps(){
  var shift = detectTempShift();
  if (isTempShiftLocked(shift)) { toast('✅ Already submitted for this shift!'); return; }
  var units = getStoreTempUnits();
  var filled = 0;
  if(units){ units.freezers.forEach(function(_,i){if(localTemps['fz'+i]!==undefined&&localTemps['fz'+i]!=='')filled++;});
    units.chillers.forEach(function(_,i){if(localTemps['ch'+i]!==undefined&&localTemps['ch'+i]!=='')filled++;}); }
  if(filled===0){ toast('⚠ Please enter at least one temperature reading'); return; }
  var store=null;
  if(currentUser&&currentUser.storeId) store=(db.stores||[]).find(function(s){return s.id===currentUser.storeId});
  if(!store&&db.stores&&db.stores.length) store=db.stores[0];
  var shiftLabel = shift === 'opening' ? 'Opening (7AM)' : 'Closing (10PM)';
  var data=await apiFetch('POST','/api/templog',{
    storeId:store?store.id:'unknown', storeName:store?store.name:'Unknown',
    crew:currentUser?currentUser.name:'Crew', shift:shiftLabel,
    readings:localTemps
  });
  if(data&&data.ok){
    lockTempShift(shift);
    localTemps = {}; // clear after submit
    await syncDB();
    renderMobileTemp();
    toast('✅ Temperature log submitted & locked!');
  } else {
    toast('⚠ Saved offline — will sync');
  }
}

// ── HISTORY ──
function renderMobileHistory(){
  var storeId=currentUser&&currentUser.storeId;
  var subs=(db.submissions||[]).filter(function(s){return !storeId||s.storeId===storeId}).slice().reverse();
  if(!subs.length){
    document.getElementById('m-hist-body').innerHTML='<div style="text-align:center;color:var(--text3);font-size:15px;padding:32px 0">No submissions yet.</div>';
    return;
  }
  var html='';
  subs.forEach(function(s){
    var ts=new Date(s.submittedAt).toLocaleString('en-PH',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
    html+='<div class="hist-item"><div class="hist-title">'+s.taskName+'</div>';
    html+='<div class="hist-meta">';
    html+=s.storeName+' · '+s.shift+'<br>';
    html+='<span style="color:var(--'+(s.status==='yes'?'green':'red')+')">'+( s.status==='yes'?'✓ Compliant':'✗ Not Compliant')+'</span>';
    if(s.remark) html+=' · '+s.remark;
    if(s.pics&&s.pics.length) html+='<br>📷 '+s.pics.length+' photo(s)';
    html+='<br>'+ts;
    if(s.approved) html+=' · <span style="color:var(--green)">✓ Approved</span>';
    html+='</div></div>';
  });
  document.getElementById('m-hist-body').innerHTML=html;
}

// ── NOTIFICATIONS (mobile) ──
function renderMobileNotif(){
  if(!currentUser||!currentUser.storeId) return;
  var all=(db.notifications||[]).filter(function(n){ return n.storeId===currentUser.storeId; });
  var unread=all.filter(function(n){ return !n.read; });
  var dot=document.getElementById('bell-dot');

  if(unread.length>0){
    dot.style.display='block';
    var latest = unread[unread.length-1];
    showPopup(latest, unread.length);
  } else {
    dot.style.display='none';
  }

  // Ensure grace engine is running for any active scheduled sessions (even if read)
  all.filter(function(n){ return n.scheduled; }).forEach(function(n){
    var minsElapsed = (Date.now() - new Date(n.sentAt).getTime()) / 60000;
    var graceMins = n.graceMins || 90;
    if (minsElapsed <= graceMins) {
      // Re-start engine without showing popup (already read)
      var key = n.scheduleKey || 'manual';
      if (!_activeSessions[key]) {
        _activeSessions[key] = { sentAt: n.sentAt, graceMins: graceMins };
        updateGraceBanner();
        if (!_graceInterval) {
          _graceInterval = setInterval(updateGraceBanner, 15000);
        }
      }
    }
  });
}

// ── COMPLIANCE GRACE PERIOD ENGINE ──
var GRACE_TIERS = [
  { maxMin:10, pct:100 },
  { maxMin:20, pct:90  },
  { maxMin:30, pct:80  },
  { maxMin:40, pct:70  },
  { maxMin:60, pct:50  },
  { maxMin:90, pct:0   },
];

// Active schedule sessions (scheduled time → { sentAt, label, graceMins })
var _activeSessions = {};  // key e.g. "7:0"
var _graceInterval = null;
var _lastShownNotifId = null;

function getCompliancePct(minutesElapsed) {
  for (var i = 0; i < GRACE_TIERS.length; i++) {
    if (minutesElapsed <= GRACE_TIERS[i].maxMin) return GRACE_TIERS[i].pct;
  }
  return 0;
}

function getNextTierChange(minutesElapsed) {
  for (var i = 0; i < GRACE_TIERS.length; i++) {
    if (minutesElapsed < GRACE_TIERS[i].maxMin) {
      return Math.ceil(GRACE_TIERS[i].maxMin - minutesElapsed);
    }
  }
  return null;
}

function startGraceEngine(sentAt, scheduleKey, graceMins) {
  // Register this session
  _activeSessions[scheduleKey || 'manual'] = { sentAt: sentAt, graceMins: graceMins || 90 };
  updateGraceBanner();
  if (!_graceInterval) {
    _graceInterval = setInterval(updateGraceBanner, 15000); // update every 15s
  }
}

function updateGraceBanner() {
  var keys = Object.keys(_activeSessions);
  if (!keys.length) {
    document.getElementById('grace-bar-wrap').classList.remove('show');
    return;
  }

  // Find the most urgent (most recently fired) session still within grace
  var now = Date.now();
  var active = null;
  keys.forEach(function(k) {
    var sess = _activeSessions[k];
    var minsElapsed = (now - new Date(sess.sentAt).getTime()) / 60000;
    if (minsElapsed <= sess.graceMins) {
      if (!active || minsElapsed < active.minsElapsed) {
        active = { key: k, sess: sess, minsElapsed: minsElapsed };
      }
    } else {
      delete _activeSessions[k]; // expired
    }
  });

  if (!active) {
    document.getElementById('grace-bar-wrap').classList.remove('show');
    if (_graceInterval && !Object.keys(_activeSessions).length) {
      clearInterval(_graceInterval); _graceInterval = null;
    }
    return;
  }

  var mins = active.minsElapsed;
  var pct = getCompliancePct(mins);
  var nextChange = getNextTierChange(mins);
  var scoreEl = document.getElementById('grace-bar-score');
  var pctClass = pct >= 90 ? 's100' : pct >= 80 ? 's80' : pct >= 70 ? 's70' : pct >= 50 ? 's50' : 's0';

  document.getElementById('grace-bar-wrap').classList.add('show');
  scoreEl.className = 'grace-score ' + pctClass;
  scoreEl.textContent = pct + '%';
  document.getElementById('grace-bar-elapsed').textContent = '+' + Math.round(mins) + ' min elapsed';
  document.getElementById('grace-bar-next').textContent = nextChange ? 'Drops in: ' + nextChange + ' min' : 'Grace period ended — 0%';

  // Update tier bars
  var tiers = document.querySelectorAll('#grace-bar-tiers .grace-tier');
  tiers.forEach(function(t) {
    var tierMin = parseInt(t.getAttribute('data-min'));
    var tierPct = parseInt(t.getAttribute('data-pct'));
    t.className = 'grace-tier' + (mins < tierMin ? ' active-' + tierPct : '');
  });

  // Update title based on score
  if (pct === 0) {
    document.getElementById('grace-bar-title').textContent = '⛔ Grace Period Ended';
    document.getElementById('grace-bar-label').textContent = 'Compliance rate is now 0% — submit to record';
  } else if (pct <= 50) {
    document.getElementById('grace-bar-title').textContent = '⚠️ Low Compliance — Act Now';
    document.getElementById('grace-bar-label').textContent = 'Submit checklist before grace ends';
  } else {
    document.getElementById('grace-bar-title').textContent = '⏱ Grace Period Active';
    document.getElementById('grace-bar-label').textContent = 'Complete checklist to record ' + pct + '% compliance';
  }

  // Also update popup grace bar if visible
  updatePopupGrace(mins, pct);
}

function updatePopupGrace(mins, pct) {
  var el = document.getElementById('popup-grace-pct');
  if (!el) return;
  el.textContent = pct + '%';
  var nextChange = getNextTierChange(mins);
  document.getElementById('popup-grace-timer').textContent = nextChange
    ? '⏱ Drops to next tier in ' + nextChange + ' min — open checklist now'
    : '⛔ Grace period ended';
  // Tier bars in popup
  var tiers = document.querySelectorAll('#popup-grace-tiers .popup-grace-tier');
  tiers.forEach(function(t) {
    var tierMin = parseInt(t.getAttribute('data-min'));
    t.classList.toggle('lit', mins < tierMin);
  });
}

function showPopup(notif, count) {
  // Don't re-show same notification
  if(_lastShownNotifId === notif.id) return;
  _lastShownNotifId = notif.id;

  var store = currentUser ? (db.stores||[]).find(function(s){ return s.id===currentUser.storeId; }) : null;
  var storeName = store ? store.name : (notif.storeName || 'Your Store');
  var isScheduled = !!notif.scheduled;

  document.getElementById('popup-store-name').textContent = storeName;
  // Shorten message for popup display (strip the long grace period description)
  var msg = notif.message || 'Please complete your energy checklist and attach photos as proof.';
  msg = msg.replace(/\s*⏱.*$/,''); // remove trailing grace period text
  document.getElementById('popup-msg').textContent = msg;
  document.getElementById('popup-subtitle').textContent = isScheduled ? '⏰ Scheduled Reminder' : '📢 From Store Manager';
  document.getElementById('popup-count').textContent = count > 1 ? count + ' pending' : '';

  var ts = new Date(notif.sentAt);
  document.getElementById('popup-time').textContent = 'Received: ' + ts.toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'}) + ', ' + ts.toLocaleDateString('en-PH',{month:'short',day:'numeric'});

  // Show grace bar only for scheduled notifications
  var graceDiv = document.getElementById('popup-grace');
  if (isScheduled) {
    graceDiv.style.display = 'block';
    var minsElapsed = (Date.now() - ts.getTime()) / 60000;
    updatePopupGrace(minsElapsed, getCompliancePct(minsElapsed));
    // Start the grace engine
    startGraceEngine(notif.sentAt, notif.scheduleKey, notif.graceMins || 90);
  } else {
    graceDiv.style.display = 'none';
  }

  document.getElementById('popup-overlay').classList.add('show');

  // Vibrate if supported (mobile)
  if(navigator.vibrate) navigator.vibrate([200,100,200]);
}

function dismissPopup() {
  document.getElementById('popup-overlay').classList.remove('show');
  if(currentUser && currentUser.storeId) {
    apiFetch('POST','/api/notifications/read',{storeId:currentUser.storeId});
  }
  dot_hide();
}

function goToChecklist() {
  document.getElementById('popup-overlay').classList.remove('show');
  if(currentUser && currentUser.storeId) {
    apiFetch('POST','/api/notifications/read',{storeId:currentUser.storeId});
    // Record compliance completion time
    apiFetch('POST','/api/compliance/complete',{storeId:currentUser.storeId});
  }
  dot_hide();
  mNav('checklist');
}

function dot_hide(){
  var d=document.getElementById('bell-dot');
  if(d) d.style.display='none';
}

function showNotif(){ 
  if(!currentUser||!currentUser.storeId) return;
  var notifs=(db.notifications||[]).filter(function(n){ return n.storeId===currentUser.storeId; });
  if(notifs.length>0){
    _lastShownNotifId=null; // force re-show
    showPopup(notifs[notifs.length-1], notifs.filter(function(n){return !n.read;}).length||1);
  }
}
function dismissNotif(){
  document.getElementById('m-notif').classList.remove('show');
  document.getElementById('bell-dot').style.display='none';
  if(currentUser&&currentUser.storeId)
    apiFetch('POST','/api/notifications/read',{storeId:currentUser.storeId});
}

// ── MOBILE NAV ──
function mNav(screen){
  ['checklist','temp','history'].forEach(function(s){
    document.getElementById('m-s-'+s).classList.toggle('active',s===screen);
    document.getElementById('mn-'+s).classList.toggle('active',s===screen);
  });
  if(screen==='temp') renderMobileTemp();
  if(screen==='history') renderMobileHistory();
}

// ── EXPORT ──
function exportReport(){
  window.location.href=API+'/api/report';
}

// ── LIGHTBOX ──
function openLightbox(src){ document.getElementById('lightbox-img').src=src; document.getElementById('lightbox').classList.add('show'); }
function closeLightbox(){ document.getElementById('lightbox').classList.remove('show'); }

// ── TOAST ──
var _tt;
function toast(msg){
  var el=document.getElementById('toast');
  el.textContent=msg; el.classList.add('show');
  clearTimeout(_tt); _tt=setTimeout(function(){ el.classList.remove('show'); },2600);
}

// ── THEME TOGGLE ──
var isLightTheme = false;
function toggleTheme() {
  isLightTheme = !isLightTheme;
  document.body.classList.toggle('light-theme', isLightTheme);
  document.getElementById('theme-toggle').textContent = isLightTheme ? '🌑 Dark' : '☀️ Light';
  localStorage.setItem('alfaTheme', isLightTheme ? 'light' : 'dark');
}
(function initTheme(){
  var saved = localStorage.getItem('alfaTheme');
  if(saved === 'light') { isLightTheme = true; document.body.classList.add('light-theme'); var btn=document.getElementById('theme-toggle'); if(btn) btn.textContent='🌑 Dark'; }
})();

// ── ENERGY CONSUMPTION SUMMARY ──
var MERALCO_RATE = 14.3345; // May 2026 official rate ₱/kWh
var KWH_DATA = {"1641": [{"date": "2026-01-01", "kwh": 310.0}, {"date": "2026-01-02", "kwh": 325.0}, {"date": "2026-01-03", "kwh": 315.0}, {"date": "2026-01-04", "kwh": 350.0}, {"date": "2026-01-05", "kwh": 330.0}, {"date": "2026-01-06", "kwh": 320.0}, {"date": "2026-01-07", "kwh": 350.0}, {"date": "2026-01-08", "kwh": 330.0}, {"date": "2026-01-09", "kwh": 325.0}, {"date": "2026-01-10", "kwh": 345.0}, {"date": "2026-01-11", "kwh": 330.0}, {"date": "2026-01-12", "kwh": 380.0}, {"date": "2026-01-13", "kwh": 350.0}, {"date": "2026-01-14", "kwh": 330.0}, {"date": "2026-01-15", "kwh": 320.0}, {"date": "2026-01-16", "kwh": 350.0}, {"date": "2026-01-17", "kwh": 330.0}, {"date": "2026-01-18", "kwh": 320.0}, {"date": "2026-01-19", "kwh": 350.0}, {"date": "2026-01-20", "kwh": 330.0}, {"date": "2026-01-21", "kwh": 320.0}, {"date": "2026-01-22", "kwh": 350.0}, {"date": "2026-01-23", "kwh": 330.0}, {"date": "2026-01-24", "kwh": 320.0}, {"date": "2026-01-25", "kwh": 350.0}, {"date": "2026-01-26", "kwh": 330.0}, {"date": "2026-01-27", "kwh": 320.0}, {"date": "2026-01-28", "kwh": 350.0}, {"date": "2026-01-29", "kwh": 330.0}, {"date": "2026-01-30", "kwh": 320.0}, {"date": "2026-01-31", "kwh": 256.0}, {"date": "2026-02-01", "kwh": 346.0}, {"date": "2026-02-02", "kwh": 346.0}, {"date": "2026-02-03", "kwh": 265.0}, {"date": "2026-02-04", "kwh": 246.0}, {"date": "2026-02-05", "kwh": 236.0}, {"date": "2026-02-06", "kwh": 242.0}, {"date": "2026-02-07", "kwh": 341.0}, {"date": "2026-02-08", "kwh": 235.0}, {"date": "2026-02-09", "kwh": 237.0}, {"date": "2026-02-10", "kwh": 236.0}, {"date": "2026-02-11", "kwh": 251.0}, {"date": "2026-02-12", "kwh": 241.0}, {"date": "2026-02-13", "kwh": 253.0}, {"date": "2026-02-14", "kwh": 242.0}, {"date": "2026-02-15", "kwh": 310.0}, {"date": "2026-02-16", "kwh": 331.0}, {"date": "2026-02-17", "kwh": 262.0}, {"date": "2026-02-18", "kwh": 268.0}, {"date": "2026-02-19", "kwh": 240.0}, {"date": "2026-02-20", "kwh": 245.0}, {"date": "2026-02-21", "kwh": 276.0}, {"date": "2026-02-22", "kwh": 263.0}, {"date": "2026-02-23", "kwh": 263.0}, {"date": "2026-02-24", "kwh": 240.0}, {"date": "2026-02-25", "kwh": 247.0}, {"date": "2026-02-26", "kwh": 268.0}, {"date": "2026-02-27", "kwh": 270.0}, {"date": "2026-02-28", "kwh": 249.0}, {"date": "2026-03-01", "kwh": 249.0}, {"date": "2026-03-02", "kwh": 240.0}, {"date": "2026-03-03", "kwh": 249.0}, {"date": "2026-03-04", "kwh": 241.0}, {"date": "2026-03-05", "kwh": 248.0}, {"date": "2026-03-06", "kwh": 246.0}, {"date": "2026-03-07", "kwh": 243.0}, {"date": "2026-03-08", "kwh": 250.0}, {"date": "2026-03-09", "kwh": 590.0}, {"date": "2026-03-10", "kwh": 236.0}, {"date": "2026-03-11", "kwh": 240.0}, {"date": "2026-03-12", "kwh": 262.0}, {"date": "2026-03-13", "kwh": 218.0}, {"date": "2026-03-14", "kwh": 210.0}, {"date": "2026-03-15", "kwh": 219.0}, {"date": "2026-03-16", "kwh": 219.0}, {"date": "2026-03-17", "kwh": 147.0}, {"date": "2026-03-18", "kwh": 235.0}, {"date": "2026-03-19", "kwh": 244.0}, {"date": "2026-03-20", "kwh": 227.0}, {"date": "2026-03-21", "kwh": 262.0}, {"date": "2026-03-22", "kwh": 247.0}, {"date": "2026-03-23", "kwh": 245.0}, {"date": "2026-03-24", "kwh": 238.0}, {"date": "2026-03-25", "kwh": 257.0}, {"date": "2026-03-26", "kwh": 319.0}, {"date": "2026-03-27", "kwh": 287.0}, {"date": "2026-03-28", "kwh": 277.0}, {"date": "2026-03-29", "kwh": 278.0}, {"date": "2026-03-30", "kwh": 275.0}, {"date": "2026-03-31", "kwh": 295.0}, {"date": "2026-04-01", "kwh": 280.0}, {"date": "2026-04-02", "kwh": 267.0}, {"date": "2026-04-03", "kwh": 257.0}, {"date": "2026-04-04", "kwh": 269.0}, {"date": "2026-04-05", "kwh": 250.0}, {"date": "2026-04-06", "kwh": 275.0}, {"date": "2026-04-07", "kwh": 290.0}, {"date": "2026-04-08", "kwh": 259.0}, {"date": "2026-04-09", "kwh": 259.0}, {"date": "2026-04-10", "kwh": 253.0}, {"date": "2026-04-11", "kwh": 326.0}, {"date": "2026-04-12", "kwh": 265.0}, {"date": "2026-04-13", "kwh": 276.0}, {"date": "2026-04-14", "kwh": 249.0}, {"date": "2026-04-15", "kwh": 238.0}, {"date": "2026-04-16", "kwh": 241.0}, {"date": "2026-04-17", "kwh": 287.0}, {"date": "2026-04-18", "kwh": 264.0}, {"date": "2026-04-19", "kwh": 259.0}, {"date": "2026-04-20", "kwh": 268.0}, {"date": "2026-04-21", "kwh": 276.0}, {"date": "2026-04-22", "kwh": 276.0}, {"date": "2026-04-23", "kwh": 292.0}, {"date": "2026-04-24", "kwh": 239.0}, {"date": "2026-04-25", "kwh": 289.0}, {"date": "2026-04-26", "kwh": 303.0}, {"date": "2026-04-27", "kwh": 293.0}, {"date": "2026-04-28", "kwh": 288.0}, {"date": "2026-04-29", "kwh": 282.0}, {"date": "2026-04-30", "kwh": 294.0}, {"date": "2026-05-01", "kwh": 259.0}, {"date": "2026-05-02", "kwh": 383.0}, {"date": "2026-05-03", "kwh": 254.0}, {"date": "2026-05-04", "kwh": 248.0}, {"date": "2026-05-05", "kwh": 260.0}, {"date": "2026-05-06", "kwh": 263.0}, {"date": "2026-05-07", "kwh": 267.0}, {"date": "2026-05-08", "kwh": 253.0}, {"date": "2026-05-09", "kwh": 294.0}, {"date": "2026-05-10", "kwh": 267.0}, {"date": "2026-05-11", "kwh": 288.0}, {"date": "2026-05-12", "kwh": 283.0}, {"date": "2026-05-13", "kwh": 230.0}, {"date": "2026-05-14", "kwh": 274.0}, {"date": "2026-05-15", "kwh": 243.0}, {"date": "2026-05-16", "kwh": 278.0}, {"date": "2026-05-17", "kwh": 275.0}, {"date": "2026-05-18", "kwh": 280.0}, {"date": "2026-05-19", "kwh": 265.0}, {"date": "2026-05-20", "kwh": 277.0}, {"date": "2026-05-21", "kwh": 316.0}, {"date": "2026-05-22", "kwh": 316.0}, {"date": "2026-05-23", "kwh": 319.0}, {"date": "2026-05-24", "kwh": 304.0}, {"date": "2026-05-25", "kwh": 271.0}, {"date": "2026-05-26", "kwh": 281.0}, {"date": "2026-05-27", "kwh": 275.0}], "1640": [{"date": "2026-01-01", "kwh": 225.0}, {"date": "2026-01-02", "kwh": 289.0}, {"date": "2026-01-03", "kwh": 246.0}, {"date": "2026-01-04", "kwh": 246.0}, {"date": "2026-01-05", "kwh": 223.0}, {"date": "2026-01-06", "kwh": 291.0}, {"date": "2026-01-07", "kwh": 261.0}, {"date": "2026-01-08", "kwh": 216.0}, {"date": "2026-01-09", "kwh": 227.0}, {"date": "2026-01-10", "kwh": 245.0}, {"date": "2026-01-11", "kwh": 233.0}, {"date": "2026-01-12", "kwh": 229.0}, {"date": "2026-01-13", "kwh": 254.0}, {"date": "2026-01-14", "kwh": 281.0}, {"date": "2026-01-15", "kwh": 129.0}, {"date": "2026-01-16", "kwh": 226.0}, {"date": "2026-01-17", "kwh": 193.0}, {"date": "2026-01-18", "kwh": 179.0}, {"date": "2026-01-19", "kwh": 196.0}, {"date": "2026-01-20", "kwh": 222.0}, {"date": "2026-01-21", "kwh": 223.0}, {"date": "2026-01-22", "kwh": 252.0}, {"date": "2026-01-23", "kwh": 207.0}, {"date": "2026-01-24", "kwh": 188.0}, {"date": "2026-01-25", "kwh": 207.0}, {"date": "2026-01-26", "kwh": 161.0}, {"date": "2026-01-27", "kwh": 134.0}, {"date": "2026-01-28", "kwh": 229.0}, {"date": "2026-01-29", "kwh": 258.0}, {"date": "2026-01-30", "kwh": 233.0}, {"date": "2026-01-31", "kwh": 202.0}, {"date": "2026-02-01", "kwh": 195.0}, {"date": "2026-02-02", "kwh": 222.0}, {"date": "2026-02-03", "kwh": 320.0}, {"date": "2026-02-04", "kwh": 283.0}, {"date": "2026-02-05", "kwh": 247.0}, {"date": "2026-02-06", "kwh": 222.0}, {"date": "2026-02-07", "kwh": 234.0}, {"date": "2026-02-08", "kwh": 245.0}, {"date": "2026-02-09", "kwh": 260.0}, {"date": "2026-02-10", "kwh": 238.0}, {"date": "2026-02-11", "kwh": 217.0}, {"date": "2026-02-12", "kwh": 222.0}, {"date": "2026-02-13", "kwh": 269.0}, {"date": "2026-02-14", "kwh": 132.0}, {"date": "2026-02-15", "kwh": 157.0}, {"date": "2026-02-16", "kwh": 237.0}, {"date": "2026-02-17", "kwh": 240.0}, {"date": "2026-02-18", "kwh": 370.0}, {"date": "2026-02-19", "kwh": 223.0}, {"date": "2026-02-20", "kwh": 243.0}, {"date": "2026-02-21", "kwh": 239.0}, {"date": "2026-02-22", "kwh": 246.0}, {"date": "2026-02-23", "kwh": 232.0}, {"date": "2026-02-24", "kwh": 203.0}, {"date": "2026-02-25", "kwh": 216.0}, {"date": "2026-02-26", "kwh": 222.0}, {"date": "2026-02-27", "kwh": 263.0}, {"date": "2026-02-28", "kwh": 234.0}, {"date": "2026-03-01", "kwh": 195.0}, {"date": "2026-03-02", "kwh": 222.0}, {"date": "2026-03-03", "kwh": 232.0}, {"date": "2026-03-04", "kwh": 233.0}, {"date": "2026-03-05", "kwh": 247.0}, {"date": "2026-03-06", "kwh": 239.0}, {"date": "2026-03-07", "kwh": 236.0}, {"date": "2026-03-08", "kwh": 245.0}, {"date": "2026-03-09", "kwh": 260.0}, {"date": "2026-03-10", "kwh": 238.0}, {"date": "2026-03-11", "kwh": 217.0}, {"date": "2026-03-12", "kwh": 221.0}, {"date": "2026-03-13", "kwh": 219.0}, {"date": "2026-03-14", "kwh": 132.0}, {"date": "2026-03-15", "kwh": 157.0}, {"date": "2026-03-16", "kwh": 836.0}, {"date": "2026-03-17", "kwh": 239.0}, {"date": "2026-03-18", "kwh": 258.0}, {"date": "2026-03-19", "kwh": 249.0}, {"date": "2026-03-20", "kwh": 234.0}, {"date": "2026-03-21", "kwh": 239.0}, {"date": "2026-03-22", "kwh": 246.0}, {"date": "2026-03-23", "kwh": 273.0}, {"date": "2026-03-24", "kwh": 277.0}, {"date": "2026-03-25", "kwh": 216.0}, {"date": "2026-03-26", "kwh": 247.0}, {"date": "2026-03-27", "kwh": 263.0}, {"date": "2026-03-28", "kwh": 234.0}, {"date": "2026-03-29", "kwh": 213.0}, {"date": "2026-03-30", "kwh": 233.0}, {"date": "2026-03-31", "kwh": 234.0}, {"date": "2026-04-01", "kwh": 223.0}, {"date": "2026-04-02", "kwh": 226.0}, {"date": "2026-04-03", "kwh": 239.0}, {"date": "2026-04-04", "kwh": 228.0}, {"date": "2026-04-05", "kwh": 235.0}, {"date": "2026-04-06", "kwh": 195.0}, {"date": "2026-04-07", "kwh": 222.0}, {"date": "2026-04-08", "kwh": 301.0}, {"date": "2026-04-09", "kwh": 261.0}, {"date": "2026-04-10", "kwh": 177.0}, {"date": "2026-04-11", "kwh": 246.0}, {"date": "2026-04-12", "kwh": 189.0}, {"date": "2026-04-13", "kwh": 236.0}, {"date": "2026-04-14", "kwh": 288.0}, {"date": "2026-04-15", "kwh": 234.0}, {"date": "2026-04-16", "kwh": 201.0}, {"date": "2026-04-17", "kwh": 211.0}, {"date": "2026-04-18", "kwh": 202.0}, {"date": "2026-04-19", "kwh": 129.0}, {"date": "2026-04-20", "kwh": 249.0}, {"date": "2026-04-21", "kwh": 220.0}, {"date": "2026-04-22", "kwh": 214.0}, {"date": "2026-04-23", "kwh": 136.0}, {"date": "2026-04-24", "kwh": 222.0}, {"date": "2026-04-25", "kwh": 239.0}, {"date": "2026-04-26", "kwh": 219.0}, {"date": "2026-04-27", "kwh": 225.0}, {"date": "2026-04-28", "kwh": 223.0}, {"date": "2026-04-29", "kwh": 221.0}, {"date": "2026-04-30", "kwh": 242.0}, {"date": "2026-05-01", "kwh": 223.0}, {"date": "2026-05-02", "kwh": 229.0}, {"date": "2026-05-03", "kwh": 226.0}, {"date": "2026-05-04", "kwh": 229.0}, {"date": "2026-05-05", "kwh": 234.0}, {"date": "2026-05-06", "kwh": 213.0}, {"date": "2026-05-07", "kwh": 234.0}, {"date": "2026-05-08", "kwh": 282.0}, {"date": "2026-05-09", "kwh": 234.0}, {"date": "2026-05-10", "kwh": 239.0}, {"date": "2026-05-11", "kwh": 313.0}, {"date": "2026-05-12", "kwh": 232.0}, {"date": "2026-05-13", "kwh": 192.0}, {"date": "2026-05-14", "kwh": 232.0}, {"date": "2026-05-15", "kwh": 233.0}, {"date": "2026-05-16", "kwh": 248.0}, {"date": "2026-05-17", "kwh": 233.0}, {"date": "2026-05-18", "kwh": 235.0}, {"date": "2026-05-19", "kwh": 262.0}, {"date": "2026-05-20", "kwh": 261.0}, {"date": "2026-05-21", "kwh": 253.0}, {"date": "2026-05-22", "kwh": 256.0}, {"date": "2026-05-23", "kwh": 250.0}, {"date": "2026-05-24", "kwh": 222.0}, {"date": "2026-05-25", "kwh": 274.0}, {"date": "2026-05-26", "kwh": 273.0}, {"date": "2026-05-27", "kwh": 282.0}], "1642": [{"date": "2026-01-01", "kwh": 162.0}, {"date": "2026-01-02", "kwh": 197.0}, {"date": "2026-01-03", "kwh": 180.0}, {"date": "2026-01-04", "kwh": 161.0}, {"date": "2026-01-05", "kwh": 202.0}, {"date": "2026-01-06", "kwh": 242.0}, {"date": "2026-01-07", "kwh": 190.0}, {"date": "2026-01-08", "kwh": 141.0}, {"date": "2026-01-09", "kwh": 226.0}, {"date": "2026-01-10", "kwh": 210.0}, {"date": "2026-01-11", "kwh": 195.0}, {"date": "2026-01-12", "kwh": 198.0}, {"date": "2026-01-13", "kwh": 193.0}, {"date": "2026-01-14", "kwh": 296.0}, {"date": "2026-01-15", "kwh": 230.0}, {"date": "2026-01-16", "kwh": 233.0}, {"date": "2026-01-17", "kwh": 165.0}, {"date": "2026-01-18", "kwh": 193.0}, {"date": "2026-01-19", "kwh": 197.0}, {"date": "2026-01-20", "kwh": 218.0}, {"date": "2026-01-21", "kwh": 269.0}, {"date": "2026-01-22", "kwh": 209.0}, {"date": "2026-01-23", "kwh": 184.0}, {"date": "2026-01-24", "kwh": 211.0}, {"date": "2026-01-25", "kwh": 267.0}, {"date": "2026-01-26", "kwh": 205.0}, {"date": "2026-01-27", "kwh": 170.0}, {"date": "2026-01-28", "kwh": 222.0}, {"date": "2026-01-29", "kwh": 186.0}, {"date": "2026-01-30", "kwh": 234.0}, {"date": "2026-01-31", "kwh": 120.0}, {"date": "2026-02-01", "kwh": 229.0}, {"date": "2026-02-02", "kwh": 231.0}, {"date": "2026-02-03", "kwh": 215.0}, {"date": "2026-02-04", "kwh": 230.0}, {"date": "2026-02-05", "kwh": 229.0}, {"date": "2026-02-06", "kwh": 218.0}, {"date": "2026-02-07", "kwh": 213.0}, {"date": "2026-02-08", "kwh": 226.0}, {"date": "2026-02-09", "kwh": 226.0}, {"date": "2026-02-10", "kwh": 226.0}, {"date": "2026-02-11", "kwh": 221.0}, {"date": "2026-02-12", "kwh": 331.0}, {"date": "2026-02-13", "kwh": 215.0}, {"date": "2026-02-14", "kwh": 214.0}, {"date": "2026-02-15", "kwh": 226.0}, {"date": "2026-02-16", "kwh": 223.0}, {"date": "2026-02-17", "kwh": 231.0}, {"date": "2026-02-18", "kwh": 222.0}, {"date": "2026-02-19", "kwh": 227.0}, {"date": "2026-02-20", "kwh": 213.0}, {"date": "2026-02-21", "kwh": 212.0}, {"date": "2026-02-22", "kwh": 220.0}, {"date": "2026-02-23", "kwh": 223.0}, {"date": "2026-02-24", "kwh": 210.0}, {"date": "2026-02-25", "kwh": 208.0}, {"date": "2026-02-26", "kwh": 229.0}, {"date": "2026-02-27", "kwh": 225.0}, {"date": "2026-02-28", "kwh": 202.0}, {"date": "2026-03-01", "kwh": 190.0}, {"date": "2026-03-02", "kwh": 225.0}, {"date": "2026-03-03", "kwh": 209.0}, {"date": "2026-03-04", "kwh": 194.0}, {"date": "2026-03-05", "kwh": 204.0}, {"date": "2026-03-06", "kwh": 176.0}, {"date": "2026-03-07", "kwh": 198.0}, {"date": "2026-03-08", "kwh": 183.0}, {"date": "2026-03-09", "kwh": 250.0}, {"date": "2026-03-10", "kwh": 180.0}, {"date": "2026-03-11", "kwh": 296.0}, {"date": "2026-03-12", "kwh": 185.0}, {"date": "2026-03-13", "kwh": 190.0}, {"date": "2026-03-14", "kwh": 200.0}, {"date": "2026-03-15", "kwh": 199.0}, {"date": "2026-03-16", "kwh": 218.0}, {"date": "2026-03-17", "kwh": 226.0}, {"date": "2026-03-18", "kwh": 128.0}, {"date": "2026-03-19", "kwh": 195.0}, {"date": "2026-03-20", "kwh": 226.0}, {"date": "2026-03-21", "kwh": 195.0}, {"date": "2026-03-22", "kwh": 244.0}, {"date": "2026-03-23", "kwh": 150.0}, {"date": "2026-03-24", "kwh": 193.0}, {"date": "2026-03-25", "kwh": 150.0}, {"date": "2026-03-26", "kwh": 225.0}, {"date": "2026-03-27", "kwh": 193.0}, {"date": "2026-03-28", "kwh": 185.0}, {"date": "2026-03-29", "kwh": 131.0}, {"date": "2026-03-30", "kwh": 265.0}, {"date": "2026-03-31", "kwh": 275.0}, {"date": "2026-04-01", "kwh": 270.0}, {"date": "2026-04-02", "kwh": 206.0}, {"date": "2026-04-03", "kwh": 210.0}, {"date": "2026-04-04", "kwh": 216.0}, {"date": "2026-04-05", "kwh": 170.0}, {"date": "2026-04-06", "kwh": 144.0}, {"date": "2026-04-07", "kwh": 259.0}, {"date": "2026-04-08", "kwh": 249.0}, {"date": "2026-04-09", "kwh": 299.0}, {"date": "2026-04-10", "kwh": 215.0}, {"date": "2026-04-11", "kwh": 221.0}, {"date": "2026-04-12", "kwh": 221.0}, {"date": "2026-04-13", "kwh": 260.0}, {"date": "2026-04-14", "kwh": 203.0}, {"date": "2026-04-15", "kwh": 274.0}, {"date": "2026-04-16", "kwh": 251.0}, {"date": "2026-04-17", "kwh": 198.0}, {"date": "2026-04-18", "kwh": 143.0}, {"date": "2026-04-19", "kwh": 180.0}, {"date": "2026-04-20", "kwh": 251.0}, {"date": "2026-04-21", "kwh": 193.0}, {"date": "2026-04-22", "kwh": 141.0}, {"date": "2026-04-23", "kwh": 281.0}, {"date": "2026-04-24", "kwh": 288.0}, {"date": "2026-04-25", "kwh": 215.0}, {"date": "2026-04-26", "kwh": 278.0}, {"date": "2026-04-27", "kwh": 173.0}, {"date": "2026-04-28", "kwh": 250.0}, {"date": "2026-04-29", "kwh": 130.0}, {"date": "2026-04-30", "kwh": 277.0}, {"date": "2026-05-01", "kwh": 222.0}, {"date": "2026-05-02", "kwh": 220.0}, {"date": "2026-05-03", "kwh": 208.0}, {"date": "2026-05-04", "kwh": 287.0}, {"date": "2026-05-05", "kwh": 210.0}, {"date": "2026-05-06", "kwh": 265.0}, {"date": "2026-05-07", "kwh": 294.0}, {"date": "2026-05-08", "kwh": 190.0}, {"date": "2026-05-09", "kwh": 257.0}, {"date": "2026-05-11", "kwh": 223.0}, {"date": "2026-05-12", "kwh": 271.0}, {"date": "2026-05-13", "kwh": 288.0}, {"date": "2026-05-14", "kwh": 270.0}, {"date": "2026-05-15", "kwh": 338.0}, {"date": "2026-05-16", "kwh": 245.0}, {"date": "2026-05-17", "kwh": 292.0}, {"date": "2026-05-18", "kwh": 264.0}, {"date": "2026-05-19", "kwh": 259.0}, {"date": "2026-05-20", "kwh": 252.0}, {"date": "2026-05-21", "kwh": 298.0}, {"date": "2026-05-22", "kwh": 259.0}, {"date": "2026-05-23", "kwh": 277.0}, {"date": "2026-05-24", "kwh": 270.0}, {"date": "2026-05-25", "kwh": 226.0}, {"date": "2026-05-26", "kwh": 310.0}, {"date": "2026-05-27", "kwh": 283.0}], "1654": [{"date": "2026-01-01", "kwh": 180.0}, {"date": "2026-01-02", "kwh": 175.0}, {"date": "2026-01-03", "kwh": 160.0}, {"date": "2026-01-04", "kwh": 190.0}, {"date": "2026-01-05", "kwh": 198.0}, {"date": "2026-01-06", "kwh": 155.0}, {"date": "2026-01-07", "kwh": 192.0}, {"date": "2026-01-08", "kwh": 188.0}, {"date": "2026-01-09", "kwh": 103.0}, {"date": "2026-01-10", "kwh": 155.0}, {"date": "2026-01-11", "kwh": 182.0}, {"date": "2026-01-12", "kwh": 198.0}, {"date": "2026-01-13", "kwh": 171.0}, {"date": "2026-01-14", "kwh": 182.0}, {"date": "2026-01-15", "kwh": 193.0}, {"date": "2026-01-16", "kwh": 189.0}, {"date": "2026-01-17", "kwh": 214.0}, {"date": "2026-01-18", "kwh": 196.0}, {"date": "2026-01-19", "kwh": 201.0}, {"date": "2026-01-20", "kwh": 197.0}, {"date": "2026-01-21", "kwh": 198.0}, {"date": "2026-01-22", "kwh": 208.0}, {"date": "2026-01-23", "kwh": 212.0}, {"date": "2026-01-24", "kwh": 202.0}, {"date": "2026-01-25", "kwh": 83.0}, {"date": "2026-01-26", "kwh": 126.0}, {"date": "2026-01-27", "kwh": 164.0}, {"date": "2026-01-28", "kwh": 178.0}, {"date": "2026-01-29", "kwh": 196.0}, {"date": "2026-01-30", "kwh": 186.0}, {"date": "2026-01-31", "kwh": 187.0}, {"date": "2026-02-01", "kwh": 176.0}, {"date": "2026-02-02", "kwh": 168.0}, {"date": "2026-02-03", "kwh": 177.0}, {"date": "2026-02-04", "kwh": 179.0}, {"date": "2026-02-05", "kwh": 176.0}, {"date": "2026-02-06", "kwh": 153.0}, {"date": "2026-02-07", "kwh": 101.0}, {"date": "2026-02-08", "kwh": 249.0}, {"date": "2026-02-09", "kwh": 190.0}, {"date": "2026-02-10", "kwh": 187.0}, {"date": "2026-02-11", "kwh": 145.0}, {"date": "2026-02-12", "kwh": 162.0}, {"date": "2026-02-13", "kwh": 181.0}, {"date": "2026-02-14", "kwh": 174.0}, {"date": "2026-02-15", "kwh": 169.0}, {"date": "2026-02-16", "kwh": 174.0}, {"date": "2026-02-17", "kwh": 182.0}, {"date": "2026-02-18", "kwh": 180.0}, {"date": "2026-02-19", "kwh": 148.0}, {"date": "2026-02-20", "kwh": 244.0}, {"date": "2026-02-21", "kwh": 194.0}, {"date": "2026-02-22", "kwh": 166.0}, {"date": "2026-02-23", "kwh": 205.0}, {"date": "2026-02-24", "kwh": 184.0}, {"date": "2026-02-25", "kwh": 171.0}, {"date": "2026-02-26", "kwh": 221.0}, {"date": "2026-02-27", "kwh": 146.0}, {"date": "2026-02-28", "kwh": 180.0}, {"date": "2026-03-01", "kwh": 189.0}, {"date": "2026-03-02", "kwh": 146.0}, {"date": "2026-03-03", "kwh": 169.0}, {"date": "2026-03-04", "kwh": 152.0}, {"date": "2026-03-05", "kwh": 166.0}, {"date": "2026-03-06", "kwh": 181.0}, {"date": "2026-03-07", "kwh": 169.0}, {"date": "2026-03-08", "kwh": 174.0}, {"date": "2026-03-09", "kwh": 228.0}, {"date": "2026-03-10", "kwh": 152.0}, {"date": "2026-03-11", "kwh": 159.0}, {"date": "2026-03-12", "kwh": 148.0}, {"date": "2026-03-13", "kwh": 201.0}, {"date": "2026-03-14", "kwh": 214.0}, {"date": "2026-03-15", "kwh": 197.0}, {"date": "2026-03-16", "kwh": 180.0}, {"date": "2026-03-17", "kwh": 229.0}, {"date": "2026-03-18", "kwh": 184.0}, {"date": "2026-03-19", "kwh": 176.0}, {"date": "2026-03-20", "kwh": 199.0}, {"date": "2026-03-21", "kwh": 144.0}, {"date": "2026-03-22", "kwh": 197.0}, {"date": "2026-03-23", "kwh": 230.0}, {"date": "2026-03-24", "kwh": 261.0}, {"date": "2026-03-25", "kwh": 233.0}, {"date": "2026-03-26", "kwh": 208.0}, {"date": "2026-03-27", "kwh": 205.0}, {"date": "2026-03-28", "kwh": 373.0}, {"date": "2026-03-29", "kwh": 95.0}, {"date": "2026-03-30", "kwh": 155.0}, {"date": "2026-03-31", "kwh": 187.0}, {"date": "2026-04-01", "kwh": 308.0}, {"date": "2026-04-02", "kwh": 233.0}, {"date": "2026-04-03", "kwh": 251.0}, {"date": "2026-04-04", "kwh": 235.0}, {"date": "2026-04-05", "kwh": 243.0}, {"date": "2026-04-06", "kwh": 221.0}, {"date": "2026-04-07", "kwh": 172.0}, {"date": "2026-04-08", "kwh": 175.0}, {"date": "2026-04-09", "kwh": 198.0}, {"date": "2026-04-10", "kwh": 211.0}, {"date": "2026-04-11", "kwh": 262.0}, {"date": "2026-04-12", "kwh": 587.0}, {"date": "2026-04-13", "kwh": 251.0}, {"date": "2026-04-14", "kwh": 210.0}, {"date": "2026-04-15", "kwh": 216.0}, {"date": "2026-04-16", "kwh": 199.0}, {"date": "2026-04-17", "kwh": 198.0}, {"date": "2026-04-18", "kwh": 204.0}, {"date": "2026-04-19", "kwh": 269.0}, {"date": "2026-04-20", "kwh": 264.0}, {"date": "2026-04-21", "kwh": 208.0}, {"date": "2026-04-22", "kwh": 214.0}, {"date": "2026-04-23", "kwh": 243.0}, {"date": "2026-04-24", "kwh": 196.0}, {"date": "2026-04-25", "kwh": 240.0}, {"date": "2026-04-26", "kwh": 184.0}, {"date": "2026-04-27", "kwh": 686.0}, {"date": "2026-04-28", "kwh": 191.0}, {"date": "2026-04-29", "kwh": 185.0}, {"date": "2026-04-30", "kwh": 584.0}, {"date": "2026-05-01", "kwh": 220.0}, {"date": "2026-05-02", "kwh": 311.0}, {"date": "2026-05-03", "kwh": 209.0}, {"date": "2026-05-04", "kwh": 218.0}, {"date": "2026-05-05", "kwh": 213.0}, {"date": "2026-05-06", "kwh": 184.0}, {"date": "2026-05-07", "kwh": 164.0}, {"date": "2026-05-08", "kwh": 197.0}, {"date": "2026-05-09", "kwh": 218.0}, {"date": "2026-05-10", "kwh": 219.0}, {"date": "2026-05-11", "kwh": 199.0}, {"date": "2026-05-12", "kwh": 276.0}, {"date": "2026-05-13", "kwh": 212.0}, {"date": "2026-05-14", "kwh": 239.0}, {"date": "2026-05-15", "kwh": 252.0}, {"date": "2026-05-16", "kwh": 220.0}, {"date": "2026-05-17", "kwh": 200.0}, {"date": "2026-05-18", "kwh": 213.0}, {"date": "2026-05-19", "kwh": 229.0}, {"date": "2026-05-20", "kwh": 210.0}, {"date": "2026-05-21", "kwh": 239.0}, {"date": "2026-05-22", "kwh": 216.0}, {"date": "2026-05-23", "kwh": 280.0}, {"date": "2026-05-24", "kwh": 152.0}, {"date": "2026-05-25", "kwh": 225.0}, {"date": "2026-05-26", "kwh": 194.0}, {"date": "2026-05-27", "kwh": 207.0}], "3137": [{"date": "2026-01-01", "kwh": 118.0}, {"date": "2026-01-02", "kwh": 213.0}, {"date": "2026-01-03", "kwh": 149.0}, {"date": "2026-01-04", "kwh": 143.0}, {"date": "2026-01-05", "kwh": 168.0}, {"date": "2026-01-06", "kwh": 172.0}, {"date": "2026-01-07", "kwh": 170.0}, {"date": "2026-01-08", "kwh": 168.0}, {"date": "2026-01-09", "kwh": 143.0}, {"date": "2026-01-10", "kwh": 142.0}, {"date": "2026-01-11", "kwh": 196.0}, {"date": "2026-01-12", "kwh": 182.0}, {"date": "2026-01-13", "kwh": 169.0}, {"date": "2026-01-14", "kwh": 165.0}, {"date": "2026-01-15", "kwh": 172.0}, {"date": "2026-01-16", "kwh": 177.0}, {"date": "2026-01-17", "kwh": 166.0}, {"date": "2026-01-18", "kwh": 170.0}, {"date": "2026-01-19", "kwh": 176.0}, {"date": "2026-01-20", "kwh": 116.0}, {"date": "2026-01-21", "kwh": 155.0}, {"date": "2026-01-22", "kwh": 176.0}, {"date": "2026-01-23", "kwh": 169.0}, {"date": "2026-01-24", "kwh": 146.0}, {"date": "2026-01-25", "kwh": 161.0}, {"date": "2026-01-26", "kwh": 153.0}, {"date": "2026-01-27", "kwh": 171.0}, {"date": "2026-01-28", "kwh": 140.0}, {"date": "2026-01-29", "kwh": 155.0}, {"date": "2026-01-30", "kwh": 150.0}, {"date": "2026-01-31", "kwh": 128.0}, {"date": "2026-02-01", "kwh": 158.0}, {"date": "2026-02-02", "kwh": 161.0}, {"date": "2026-02-03", "kwh": 162.0}, {"date": "2026-02-04", "kwh": 171.0}, {"date": "2026-02-05", "kwh": 160.0}, {"date": "2026-02-06", "kwh": 149.0}, {"date": "2026-02-07", "kwh": 150.0}, {"date": "2026-02-08", "kwh": 145.0}, {"date": "2026-02-09", "kwh": 151.0}, {"date": "2026-02-10", "kwh": 150.0}, {"date": "2026-02-11", "kwh": 152.0}, {"date": "2026-02-12", "kwh": 130.0}, {"date": "2026-02-13", "kwh": 152.0}, {"date": "2026-02-14", "kwh": 144.0}, {"date": "2026-02-15", "kwh": 152.0}, {"date": "2026-02-16", "kwh": 170.0}, {"date": "2026-02-17", "kwh": 174.0}, {"date": "2026-02-18", "kwh": 150.0}, {"date": "2026-02-19", "kwh": 180.0}, {"date": "2026-02-20", "kwh": 156.0}, {"date": "2026-02-21", "kwh": 165.0}, {"date": "2026-02-22", "kwh": 158.0}, {"date": "2026-02-23", "kwh": 154.0}, {"date": "2026-02-24", "kwh": 179.0}, {"date": "2026-02-25", "kwh": 163.0}, {"date": "2026-02-26", "kwh": 164.0}, {"date": "2026-02-27", "kwh": 176.0}, {"date": "2026-02-28", "kwh": 189.0}, {"date": "2026-03-01", "kwh": 184.0}, {"date": "2026-03-02", "kwh": 168.0}, {"date": "2026-03-03", "kwh": 174.0}, {"date": "2026-03-04", "kwh": 183.0}, {"date": "2026-03-05", "kwh": 162.0}, {"date": "2026-03-06", "kwh": 190.0}, {"date": "2026-03-07", "kwh": 173.0}, {"date": "2026-03-08", "kwh": 150.0}, {"date": "2026-03-09", "kwh": 181.0}, {"date": "2026-03-10", "kwh": 157.0}, {"date": "2026-03-11", "kwh": 170.0}, {"date": "2026-03-12", "kwh": 178.0}, {"date": "2026-03-13", "kwh": 184.0}, {"date": "2026-03-14", "kwh": 173.0}, {"date": "2026-03-15", "kwh": 176.0}, {"date": "2026-03-16", "kwh": 186.0}, {"date": "2026-03-17", "kwh": 199.0}, {"date": "2026-03-18", "kwh": 194.0}, {"date": "2026-03-19", "kwh": 192.0}, {"date": "2026-03-20", "kwh": 112.0}, {"date": "2026-03-21", "kwh": 200.0}, {"date": "2026-03-22", "kwh": 170.0}, {"date": "2026-03-23", "kwh": 185.0}, {"date": "2026-03-24", "kwh": 186.0}, {"date": "2026-03-25", "kwh": 178.0}, {"date": "2026-03-26", "kwh": 173.0}, {"date": "2026-03-27", "kwh": 189.0}, {"date": "2026-03-28", "kwh": 177.0}, {"date": "2026-03-29", "kwh": 182.0}, {"date": "2026-03-30", "kwh": 178.0}, {"date": "2026-03-31", "kwh": 168.0}, {"date": "2026-04-01", "kwh": 140.0}, {"date": "2026-04-02", "kwh": 150.0}, {"date": "2026-04-03", "kwh": 150.0}, {"date": "2026-04-04", "kwh": 160.0}, {"date": "2026-04-05", "kwh": 166.0}, {"date": "2026-04-06", "kwh": 162.0}, {"date": "2026-04-07", "kwh": 181.0}, {"date": "2026-04-08", "kwh": 157.0}, {"date": "2026-04-09", "kwh": 165.0}, {"date": "2026-04-10", "kwh": 160.0}, {"date": "2026-04-11", "kwh": 184.0}, {"date": "2026-04-12", "kwh": 187.0}, {"date": "2026-04-13", "kwh": 177.0}, {"date": "2026-04-14", "kwh": 215.0}, {"date": "2026-04-15", "kwh": 189.0}, {"date": "2026-04-16", "kwh": 197.0}, {"date": "2026-04-17", "kwh": 187.0}, {"date": "2026-04-18", "kwh": 213.0}, {"date": "2026-04-19", "kwh": 199.0}, {"date": "2026-04-20", "kwh": 188.0}, {"date": "2026-04-21", "kwh": 198.0}, {"date": "2026-04-22", "kwh": 183.0}, {"date": "2026-04-23", "kwh": 197.0}, {"date": "2026-04-24", "kwh": 218.0}, {"date": "2026-04-25", "kwh": 189.0}, {"date": "2026-04-26", "kwh": 221.0}, {"date": "2026-04-27", "kwh": 218.0}, {"date": "2026-04-28", "kwh": 222.0}, {"date": "2026-04-29", "kwh": 253.0}, {"date": "2026-04-30", "kwh": 261.0}, {"date": "2026-05-01", "kwh": 242.0}, {"date": "2026-05-02", "kwh": 223.0}, {"date": "2026-05-03", "kwh": 244.0}, {"date": "2026-05-04", "kwh": 227.0}, {"date": "2026-05-05", "kwh": 212.0}, {"date": "2026-05-06", "kwh": 215.0}, {"date": "2026-05-07", "kwh": 191.0}, {"date": "2026-05-08", "kwh": 178.0}, {"date": "2026-05-09", "kwh": 215.0}, {"date": "2026-05-10", "kwh": 205.0}, {"date": "2026-05-11", "kwh": 177.0}, {"date": "2026-05-12", "kwh": 200.0}, {"date": "2026-05-13", "kwh": 157.0}, {"date": "2026-05-14", "kwh": 200.0}, {"date": "2026-05-15", "kwh": 239.0}, {"date": "2026-05-16", "kwh": 192.0}, {"date": "2026-05-17", "kwh": 215.0}, {"date": "2026-05-18", "kwh": 192.0}, {"date": "2026-05-19", "kwh": 174.0}, {"date": "2026-05-20", "kwh": 174.0}, {"date": "2026-05-21", "kwh": 247.0}, {"date": "2026-05-22", "kwh": 257.0}, {"date": "2026-05-23", "kwh": 234.0}, {"date": "2026-05-24", "kwh": 251.0}, {"date": "2026-05-25", "kwh": 236.0}, {"date": "2026-05-26", "kwh": 240.0}, {"date": "2026-05-27", "kwh": 236.0}], "5682": [{"date": "2026-01-01", "kwh": 142.0}, {"date": "2026-01-02", "kwh": 143.0}, {"date": "2026-01-03", "kwh": 145.0}, {"date": "2026-01-04", "kwh": 115.0}, {"date": "2026-01-05", "kwh": 110.0}, {"date": "2026-01-06", "kwh": 142.0}, {"date": "2026-01-07", "kwh": 156.0}, {"date": "2026-01-08", "kwh": 150.0}, {"date": "2026-01-09", "kwh": 125.0}, {"date": "2026-01-10", "kwh": 130.0}, {"date": "2026-01-11", "kwh": 160.0}, {"date": "2026-01-12", "kwh": 165.0}, {"date": "2026-01-13", "kwh": 115.0}, {"date": "2026-01-14", "kwh": 105.0}, {"date": "2026-01-15", "kwh": 140.0}, {"date": "2026-01-16", "kwh": 145.0}, {"date": "2026-01-17", "kwh": 143.0}, {"date": "2026-01-18", "kwh": 153.0}, {"date": "2026-01-19", "kwh": 180.0}, {"date": "2026-01-20", "kwh": 170.0}, {"date": "2026-01-21", "kwh": 118.0}, {"date": "2026-01-22", "kwh": 120.0}, {"date": "2026-01-23", "kwh": 145.0}, {"date": "2026-01-24", "kwh": 150.0}, {"date": "2026-01-25", "kwh": 166.0}, {"date": "2026-01-26", "kwh": 115.0}, {"date": "2026-01-27", "kwh": 143.0}, {"date": "2026-01-28", "kwh": 140.0}, {"date": "2026-01-29", "kwh": 155.0}, {"date": "2026-01-30", "kwh": 153.0}, {"date": "2026-01-31", "kwh": 175.0}, {"date": "2026-02-01", "kwh": 151.0}, {"date": "2026-02-02", "kwh": 142.0}, {"date": "2026-02-03", "kwh": 140.0}, {"date": "2026-02-04", "kwh": 136.0}, {"date": "2026-02-05", "kwh": 120.0}, {"date": "2026-02-06", "kwh": 138.0}, {"date": "2026-02-07", "kwh": 136.0}, {"date": "2026-02-08", "kwh": 145.0}, {"date": "2026-02-09", "kwh": 150.0}, {"date": "2026-02-10", "kwh": 172.0}, {"date": "2026-02-11", "kwh": 183.0}, {"date": "2026-02-12", "kwh": 145.0}, {"date": "2026-02-13", "kwh": 138.0}, {"date": "2026-02-14", "kwh": 125.0}, {"date": "2026-02-15", "kwh": 115.0}, {"date": "2026-02-16", "kwh": 125.0}, {"date": "2026-02-17", "kwh": 170.0}, {"date": "2026-02-18", "kwh": 180.0}, {"date": "2026-02-19", "kwh": 140.0}, {"date": "2026-02-20", "kwh": 143.0}, {"date": "2026-02-21", "kwh": 165.0}, {"date": "2026-02-22", "kwh": 160.0}, {"date": "2026-02-23", "kwh": 153.0}, {"date": "2026-02-24", "kwh": 150.0}, {"date": "2026-02-25", "kwh": 115.0}, {"date": "2026-02-26", "kwh": 130.0}, {"date": "2026-02-28", "kwh": 200.0}, {"date": "2026-03-01", "kwh": 118.0}, {"date": "2026-03-02", "kwh": 105.0}, {"date": "2026-03-03", "kwh": 130.0}, {"date": "2026-03-04", "kwh": 153.0}, {"date": "2026-03-05", "kwh": 143.0}, {"date": "2026-03-06", "kwh": 145.0}, {"date": "2026-03-07", "kwh": 120.0}, {"date": "2026-03-08", "kwh": 115.0}, {"date": "2026-03-09", "kwh": 153.0}, {"date": "2026-03-10", "kwh": 150.0}, {"date": "2026-03-11", "kwh": 130.0}, {"date": "2026-03-12", "kwh": 118.0}, {"date": "2026-03-13", "kwh": 118.0}, {"date": "2026-03-14", "kwh": 140.0}, {"date": "2026-03-15", "kwh": 135.0}, {"date": "2026-03-16", "kwh": 120.0}, {"date": "2026-03-17", "kwh": 123.0}, {"date": "2026-03-18", "kwh": 166.0}, {"date": "2026-03-19", "kwh": 142.0}, {"date": "2026-03-20", "kwh": 140.0}, {"date": "2026-03-21", "kwh": 120.0}, {"date": "2026-03-22", "kwh": 135.0}, {"date": "2026-03-23", "kwh": 128.0}, {"date": "2026-03-24", "kwh": 143.0}, {"date": "2026-03-25", "kwh": 143.0}, {"date": "2026-03-26", "kwh": 180.0}, {"date": "2026-03-27", "kwh": 124.0}, {"date": "2026-03-28", "kwh": 135.0}, {"date": "2026-03-29", "kwh": 136.0}, {"date": "2026-03-30", "kwh": 143.0}, {"date": "2026-03-31", "kwh": 126.0}, {"date": "2026-04-01", "kwh": 130.0}, {"date": "2026-04-02", "kwh": 134.0}, {"date": "2026-04-03", "kwh": 143.0}, {"date": "2026-04-04", "kwh": 143.0}, {"date": "2026-04-05", "kwh": 160.0}, {"date": "2026-04-06", "kwh": 142.0}, {"date": "2026-04-07", "kwh": 125.0}, {"date": "2026-04-08", "kwh": 115.0}, {"date": "2026-04-09", "kwh": 165.0}, {"date": "2026-04-10", "kwh": 140.0}, {"date": "2026-04-11", "kwh": 150.0}, {"date": "2026-04-12", "kwh": 143.0}, {"date": "2026-04-13", "kwh": 125.0}, {"date": "2026-04-14", "kwh": 145.0}, {"date": "2026-04-15", "kwh": 150.0}, {"date": "2026-04-16", "kwh": 134.0}, {"date": "2026-04-17", "kwh": 153.0}, {"date": "2026-04-18", "kwh": 120.0}, {"date": "2026-04-19", "kwh": 140.0}, {"date": "2026-04-20", "kwh": 130.0}, {"date": "2026-04-21", "kwh": 138.0}, {"date": "2026-04-22", "kwh": 145.0}, {"date": "2026-04-23", "kwh": 125.0}, {"date": "2026-04-24", "kwh": 140.0}, {"date": "2026-04-25", "kwh": 137.0}, {"date": "2026-04-26", "kwh": 143.0}, {"date": "2026-04-27", "kwh": 150.0}, {"date": "2026-04-29", "kwh": 138.0}, {"date": "2026-04-30", "kwh": 126.0}, {"date": "2026-05-01", "kwh": 143.0}, {"date": "2026-05-02", "kwh": 139.0}, {"date": "2026-05-03", "kwh": 149.0}, {"date": "2026-05-04", "kwh": 153.0}, {"date": "2026-05-05", "kwh": 148.0}, {"date": "2026-05-06", "kwh": 150.0}, {"date": "2026-05-07", "kwh": 150.0}, {"date": "2026-05-08", "kwh": 144.0}, {"date": "2026-05-09", "kwh": 177.0}, {"date": "2026-05-10", "kwh": 158.0}, {"date": "2026-05-11", "kwh": 172.0}, {"date": "2026-05-12", "kwh": 158.0}, {"date": "2026-05-13", "kwh": 172.0}, {"date": "2026-05-14", "kwh": 150.0}, {"date": "2026-05-15", "kwh": 166.0}, {"date": "2026-05-16", "kwh": 175.0}, {"date": "2026-05-17", "kwh": 168.0}, {"date": "2026-05-18", "kwh": 165.0}, {"date": "2026-05-19", "kwh": 121.0}, {"date": "2026-05-20", "kwh": 133.0}, {"date": "2026-05-21", "kwh": 179.0}, {"date": "2026-05-22", "kwh": 157.0}, {"date": "2026-05-23", "kwh": 155.0}, {"date": "2026-05-24", "kwh": 167.0}, {"date": "2026-05-25", "kwh": 157.0}, {"date": "2026-05-26", "kwh": 157.0}, {"date": "2026-05-27", "kwh": 163.0}]};

var APPLIANCES = [
  { name:'Air Conditioning / HVAC',        cat:'hvac',    kw:1.5,  on:'7:00 AM',  off:'10:00 PM', hours:15 },
  { name:'Flood Light',                    cat:'light',   kw:0.15, on:'5:40 PM',  off:'12:00 MN', hours:6.3 },
  { name:'Façade Light',                   cat:'light',   kw:0.08, on:'5:40 PM',  off:'12:00 MN', hours:6.3 },
  { name:'Pylon Sign',                     cat:'light',   kw:0.05, on:'5:40 PM',  off:'12:00 MN', hours:6.3 },
  { name:'Canopy Lights',                  cat:'light',   kw:0.12, on:'5:40 PM',  off:'12:00 MN', hours:6.3 },
  { name:'Selling Area Lights (50%)',      cat:'light',   kw:0.6,  on:'6:00 AM',  off:'10:00 AM', hours:4   },
  { name:'Selling Area Lights (100%)',     cat:'light',   kw:1.2,  on:'10:00 AM', off:'12:00 MN', hours:14  },
  { name:'Stock Room / CR / Backdoor',     cat:'light',   kw:0.1,  on:'As Needed',off:'12:00 MN', hours:5   },
  { name:'POS / Server',                   cat:'pos',     kw:0.3,  on:'7:00 AM',  off:'12:00 MN', hours:17  },
  { name:'RTE Rice Cooker',                cat:'rte',     kw:0.7,  on:'7:00 AM',  off:'12:00 MN', hours:17  },
  { name:'RTE Boiler',                     cat:'rte',     kw:1.5,  on:'7:00 AM',  off:'12:00 MN', hours:17  },
  { name:'RTE Steamer',                    cat:'rte',     kw:0.9,  on:'7:00 AM',  off:'12:00 MN', hours:17  },
  { name:'RTE Fryer',                      cat:'rte',     kw:2.0,  on:'7:00 AM',  off:'12:00 MN', hours:17  },
  { name:'RTE Kettle',                     cat:'rte',     kw:1.0,  on:'7:00 AM',  off:'12:00 MN', hours:17  },
  { name:'Freezers (avg per unit)',         cat:'cooling', kw:0.45, on:'Always',   off:'Always',   hours:24  },
  { name:'Chillers (avg per unit)',         cat:'cooling', kw:0.35, on:'7:00 AM',  off:'10:00 PM', hours:15  },
];

// Per-store appliance overrides (same base, different unit counts)
var STORE_APPLIANCE_CONFIG = {
  manabat:  { label:'ATP M MANABAT ST B...', acUnits:2, freezerUnits:13, chillerUnits:4,  rteItems:['Rice Cooker','Boiler','Steamer','Fryer','Kettle'] },
  halang:   { label:'ATP HALANG BINAN',      acUnits:2, freezerUnits:17, chillerUnits:5,  rteItems:['Rice Cooker','Boiler','Steamer','Fryer','Kettle'] },
  tatlong:  { label:'ATP TATLONG HARI',       acUnits:2, freezerUnits:11, chillerUnits:6,  rteItems:['Rice Cooker','Boiler','Steamer','Fryer','Kettle'] },
  interior: { label:'ATP INTERIOR LT BRGY',   acUnits:1, freezerUnits:9,  chillerUnits:4,  rteItems:['Rice Cooker','Boiler','Steamer','Fryer','Kettle'] },
  banay:    { label:'ATP BANAYBANAY',         acUnits:2, freezerUnits:9,  chillerUnits:3,  rteItems:['Rice Cooker','Boiler','Steamer','Fryer','Kettle'] },
  timbao:   { label:'ATP TIMBAO ROAD',        acUnits:2, freezerUnits:12, chillerUnits:6,  rteItems:['Rice Cooker','Boiler','Steamer','Fryer','Kettle'] },
};

function getStoreAppliances(storeId) {
  var cfg = STORE_APPLIANCE_CONFIG[storeId] || {};
  var list = APPLIANCES.slice();
  // Scale freezer/chiller kWh by unit count vs base (base = 1 unit per row)
  var fzBase = 1, chBase = 1;
  var fzCount = cfg.freezerUnits || 1;
  var chCount = cfg.chillerUnits || 1;
  return list.map(function(a) {
    var ap = Object.assign({}, a);
    if (a.cat === 'cooling') {
      if (a.name.indexOf('Freezer') !== -1) { ap.kw = parseFloat((a.kw * fzCount).toFixed(2)); ap.name = a.name + ' (×'+fzCount+')'; }
      else if (a.name.indexOf('Chiller') !== -1) { ap.kw = parseFloat((a.kw * chCount).toFixed(2)); ap.name = a.name + ' (×'+chCount+')'; }
    }
    return ap;
  });
}

// Energy filter state
var energySearch = '';
var energySort = 'default';
var energyRangeMin = '';
var energyRangeMax = '';
var energyCatFilter = '';
var energyViewMode = 'appliances';

// Compliance panel filter state
var {} = {}; // storeId → true/false (true = show)
// Compliance filter state — persisted across refresh
var compSelectedDate  = (function(){ try { return localStorage.getItem('comp_date') || new Date().toISOString().slice(0,10); } catch(e){ return new Date().toISOString().slice(0,10); } })();
var compSearchQuery   = (function(){ try { return localStorage.getItem('comp_search') || ''; } catch(e){ return ''; } })();
var compExpandedStore = (function(){ try { return localStorage.getItem('comp_expanded') || null; } catch(e){ return null; } })();
var meralcoView = 'daily'; // 'daily' | 'weekly' | 'monthly'
var meralcoDateFrom = '';
var meralcoDateTo = '';

function getStoreKwhData(storeNo) {
  if (!storeNo) return [];
  return KWH_DATA[String(storeNo)] || [];
}

// All-stores appliance filter state
var asFilter = '';
var asSort = 'default';
var asStoreFilter = '';

function renderEnergySummary() {
  var wrap = document.getElementById('energy-summary-wrap');
  if (!wrap) return;
  if (energyViewMode === 'meralco') { renderMeralcoView(wrap); return; }
  if (energyViewMode === 'allstores') { renderAllStoresAppliance(wrap); return; }
  renderApplianceView(wrap);
}

function renderAllStoresAppliance(wrap) {
  var stores = db.stores || [];
  var RATE = MERALCO_RATE;

  var html = '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:14px;margin-bottom:12px">';
  html += '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:12px">';
  html += '<div><div style="font-size:13px;font-weight:600">🏪 Appliance Consumption — All Stores ('+stores.length+')</div>';
  html += '<div style="font-size:14px;color:var(--text2);margin-top:2px">Rate: <b style="color:var(--amber)">₱'+RATE.toFixed(4)+'/kWh</b></div></div>';
  // View toggle
  html += '<div style="display:flex;gap:4px;background:var(--bg3);border-radius:var(--rs);padding:3px">';
  ['appliances','allstores','meralco'].forEach(function(m){
    var lbl = m==='appliances'?'🔌 Appliances':m==='allstores'?'🏪 All Stores':'⚡ Meralco KWH';
    var act = energyViewMode===m;
    html += '<button data-val="'+m+'" onclick="setEnergyView(this)" style="padding:5px 10px;font-size:13px;border:none;border-radius:5px;cursor:pointer;background:'+(act?'var(--bg4)':'transparent')+';color:'+(act?'var(--text)':'var(--text2)')+';font-weight:'+(act?'600':'400')+'">'+lbl+'</button>';
  });
  html += '</div></div>';

  // Filters
  html += '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px">';
  html += '<input type="text" placeholder="🔍 Search appliance..." value="'+asFilter+'" oninput="asFilter=this.value;renderEnergySummary()" style="flex:1;min-width:120px;padding:6px 10px;border:1px solid var(--border2);border-radius:var(--rs);background:var(--bg3);color:var(--text);font-size:15px">';
  html += '<select onchange="asSort=this.value;renderEnergySummary()" style="padding:6px 10px;border:1px solid var(--border2);border-radius:var(--rs);background:var(--bg3);color:var(--text);font-size:15px">';
  [['default','📋 Default'],['kwh-hi','kWh: High→Low'],['kwh-lo','kWh: Low→High'],['cost-hi','Cost: High→Low']].forEach(function(s){
    html += '<option value="'+s[0]+'"'+(asSort===s[0]?' selected':'')+'>'+s[1]+'</option>';
  });
  html += '</select>';
  html += '<select onchange="asStoreFilter=this.value;renderEnergySummary()" style="padding:6px 10px;border:1px solid var(--border2);border-radius:var(--rs);background:var(--bg3);color:var(--text);font-size:15px">';
  html += '<option value="">All Stores</option>';
  stores.forEach(function(s){html += '<option value="'+s.id+'"'+(asStoreFilter===s.id?' selected':'')+'>'+s.storeNo+' '+s.short+'</option>';});
  html += '</select>';
  html += '</div>';
  html += '</div>';

  // Build per-store table
  var targetStores = asStoreFilter ? stores.filter(function(s){return s.id===asStoreFilter;}) : stores;

  targetStores.forEach(function(store) {
    var apps = getStoreAppliances(store.id);
    if (asFilter) { var q=asFilter.toLowerCase(); apps=apps.filter(function(a){return a.name.toLowerCase().indexOf(q)!==-1;}); }
    apps.sort(function(a,b){
      var ka=a.kw*a.hours, kb=b.kw*b.hours;
      if(asSort==='kwh-hi') return kb-ka;
      if(asSort==='kwh-lo') return ka-kb;
      if(asSort==='cost-hi') return (kb-ka)*RATE;
      return 0;
    });
    var totalKwh = apps.reduce(function(s,a){return s+a.kw*a.hours;},0);
    var maxA = Math.max.apply(null, apps.map(function(a){return a.kw*a.hours;}));

    html += '<div style="margin-bottom:14px">';
    html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">';
    html += '<div style="width:32px;height:32px;border-radius:8px;background:var(--red);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;flex-shrink:0">'+store.short+'</div>';
    html += '<div>';
    html += '<div style="font-size:15px;font-weight:600">'+store.name+'</div>';
    html += '<div style="font-size:13px;color:var(--text2)">'+apps.length+' appliances · <span style="color:var(--blue);font-weight:600">'+totalKwh.toFixed(1)+' kWh/day</span> · <span style="color:var(--red);font-weight:600">₱'+Math.round(totalKwh*30*RATE).toLocaleString()+'/mo</span></div>';
    html += '</div></div>';

    html += '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--rs);overflow:hidden">';
    apps.forEach(function(a, i) {
      var kwh = a.kw*a.hours;
      var barW = maxA>0?Math.round((kwh/maxA)*100):0;
      var cost = Math.round(kwh*RATE);
      var pct = totalKwh>0?((kwh/totalKwh)*100).toFixed(0):0;
      var barColor = kwh===maxA?'var(--red)':kwh>=maxA*0.6?'var(--amber)':'var(--blue)';
      html += '<div style="display:flex;align-items:center;gap:8px;padding:6px 12px;'+(i%2===0?'':'background:var(--bg3)')+'">';
      html += '<div style="font-size:13px;color:var(--text2);width:140px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+a.name+'</div>';
      html += '<div style="flex:1;height:14px;background:var(--border);border-radius:3px;overflow:hidden">';
      html += '<div style="height:14px;width:'+barW+'%;background:'+barColor+';border-radius:3px;display:flex;align-items:center;padding:0 5px">';
      html += '<span style="font-size:13px;color:#fff;font-weight:700;white-space:nowrap">'+kwh.toFixed(1)+'</span>';
      html += '</div></div>';
      html += '<div style="width:80px;text-align:right;font-size:13px;font-family:var(--mono);color:var(--text2);flex-shrink:0">₱'+cost+' <span style="color:var(--text3)">'+pct+'%</span></div>';
      html += '</div>';
    });
    html += '</div></div>';
  });

  wrap.innerHTML = html;
}

function renderMeralcoView(wrap) {
  var stores = db.stores || [];
  var targetStore = selectedStoreId ? stores.find(function(s){ return s.id===selectedStoreId; }) : null;

  // Build list of stores to show
  var storeList = targetStore ? [targetStore] : stores;

  // Aggregate KWH data
  function getRows(store) {
    var rows = getStoreKwhData(store.storeNo);
    if (!rows.length) return [];
    // Date filter
    return rows.filter(function(r) {
      if (meralcoDateFrom && r.date < meralcoDateFrom) return false;
      if (meralcoDateTo && r.date > meralcoDateTo) return false;
      return true;
    });
  }

  function weekKey(dateStr) {
    var d = new Date(dateStr);
    var jan1 = new Date(d.getFullYear(),0,1);
    var wk = Math.ceil(((d-jan1)/86400000 + jan1.getDay()+1)/7);
    return d.getFullYear()+'-W'+String(wk).padStart(2,'0');
  }
  function monthKey(dateStr) { return dateStr.slice(0,7); }

  var html = '';

  // ── HEADER ──
  html += '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:16px;margin-bottom:12px">';
  html += '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px">';
  html += '<div>';
  html += '<div style="font-size:14px;font-weight:700;letter-spacing:-0.01em">⚡ Meralco KWH Monitoring</div>';
  html += '<div style="font-size:14px;color:var(--text2);margin-top:2px">Rate: <b style="color:var(--amber)">₱'+MERALCO_RATE.toFixed(4)+'/kWh</b> &nbsp;·&nbsp; May 2026 Official</div>';
  html += '</div>';
  // View toggle
  html += '<div style="display:flex;gap:4px;background:var(--bg3);border-radius:var(--rs);padding:3px">';
  ['appliances','allstores','meralco'].forEach(function(m){
    var lbl = m==='appliances' ? '🔌 Appliances' : m==='allstores' ? '🏪 All Stores' : '⚡ Meralco KWH';
    var act = energyViewMode===m;
    html += '<button onclick="setEnergyView(this)" data-val="'+m+'" style="padding:5px 11px;font-size:14px;border:none;border-radius:6px;cursor:pointer;background:'+(act?'var(--bg4)':'transparent')+';color:'+(act?'var(--text)':'var(--text2)')+';font-weight:'+(act?'600':'400')+'">'+lbl+'</button>';
  });
  html += '</div>';
  html += '</div>';

  // Filters row
  html += '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px">';
  // View mode chips
  ['daily','weekly','monthly'].forEach(function(v){
    var act = meralcoView===v;
    html += '<button onclick="setMeralcoView(this)" data-val="'+v+'" style="padding:4px 12px;border-radius:20px;border:1px solid '+(act?'var(--blue)':'var(--border2)')+';background:'+(act?'var(--blue-bg)':'transparent')+';color:'+(act?'var(--blue)':'var(--text2)')+';font-size:14px;cursor:pointer;font-weight:'+(act?'600':'400')+'">'+v.charAt(0).toUpperCase()+v.slice(1)+'</button>';
  });
  html += '<input type="date" value="'+meralcoDateFrom+'" onchange="meralcoDateFrom=this.value;renderEnergySummary()" style="padding:5px 8px;border:1px solid var(--border2);border-radius:var(--rs);background:var(--bg3);color:var(--text);font-size:14px" placeholder="From">';
  html += '<input type="date" value="'+meralcoDateTo+'" onchange="meralcoDateTo=this.value;renderEnergySummary()" style="padding:5px 8px;border:1px solid var(--border2);border-radius:var(--rs);background:var(--bg3);color:var(--text);font-size:14px" placeholder="To">';
  if (meralcoDateFrom||meralcoDateTo) {
    html += '<button onclick="clearMeralcoDates()" style="padding:5px 10px;border:1px solid var(--border2);border-radius:var(--rs);background:var(--bg3);color:var(--text2);font-size:14px;cursor:pointer">✕ Clear</button>';
  }
  html += '</div>';
  html += '</div>'; // end header card

  // ── SUMMARY CARDS (all stores) ──
  var allTotals = stores.map(function(s){
    var rows = getRows(s);
    var totalKwh = rows.reduce(function(a,r){return a+r.kwh;},0);
    return { store: s, kwh: totalKwh, cost: totalKwh * MERALCO_RATE, count: rows.length };
  }).sort(function(a,b){return b.kwh-a.kwh;});

  var grandKwh = allTotals.reduce(function(a,x){return a+x.kwh;},0);
  var grandCost = grandKwh * MERALCO_RATE;

  html += '<div class="stat-grid" style="margin-bottom:12px">';
  html += '<div class="stat-card"><div class="stat-lbl">Total KWH (All Stores)</div><div class="stat-val" style="color:var(--blue)">'+Math.round(grandKwh).toLocaleString()+'</div><div class="stat-trend">filtered period</div></div>';
  html += '<div class="stat-card"><div class="stat-lbl">Total Billing (All Stores)</div><div class="stat-val" style="color:var(--red);font-size:26px">₱'+Math.round(grandCost).toLocaleString()+'</div><div class="stat-trend">@ ₱'+MERALCO_RATE.toFixed(4)+'/kWh</div></div>';
  var highest = allTotals[0];
  html += '<div class="stat-card"><div class="stat-lbl">Highest Consumer</div><div class="stat-val" style="font-size:16px;color:var(--amber)">'+(highest?highest.store.storeNo:'—')+'</div><div class="stat-trend">'+(highest?highest.store.name:'—')+'<br><b>'+Math.round(highest?highest.kwh:0).toLocaleString()+' kWh</b></div></div>';
  var lowest = allTotals[allTotals.length-1];
  html += '<div class="stat-card"><div class="stat-lbl">Lowest Consumer</div><div class="stat-val" style="font-size:16px;color:var(--green)">'+(lowest?lowest.store.storeNo:'—')+'</div><div class="stat-trend">'+(lowest?lowest.store.name:'—')+'<br><b>'+Math.round(lowest?lowest.kwh:0).toLocaleString()+' kWh</b></div></div>';
  html += '</div>';

  // ── PER-STORE TABLE ──
  html += '<div class="crew-table-wrap" style="margin-bottom:12px"><table class="crew-table"><thead><tr>';
  html += '<th>Store No.</th><th>Store Name</th><th>Days</th><th>Total KWH</th><th>Avg KWH/Day</th><th>Peak Day KWH</th><th>Meralco Billing</th><th>% of Total</th>';
  html += '</tr></thead><tbody>';

  allTotals.forEach(function(x, i) {
    var pct = grandKwh > 0 ? ((x.kwh/grandKwh)*100).toFixed(1) : 0;
    var rows = getRows(x.store);
    var avg = rows.length ? (x.kwh/rows.length).toFixed(1) : '—';
    var peak = rows.length ? Math.max.apply(null, rows.map(function(r){return r.kwh;})) : 0;
    var barW = grandKwh > 0 ? Math.round((x.kwh/grandKwh)*100) : 0;
    var isSelected = selectedStoreId === x.store.id;
    html += '<tr style="'+(isSelected?'background:var(--blue-bg)':'')+'">';
    html += '<td><span class="pill pill-blue">'+x.store.storeNo+'</span></td>';
    html += '<td style="font-size:14px;font-weight:500">'+x.store.name+'</td>';
    html += '<td style="font-family:var(--mono);font-size:14px">'+x.count+'</td>';
    html += '<td style="font-family:var(--mono);font-size:15px;font-weight:600;color:var(--blue)">'+Math.round(x.kwh).toLocaleString()+'</td>';
    html += '<td style="font-family:var(--mono);font-size:14px;color:var(--text2)">'+avg+'</td>';
    html += '<td style="font-family:var(--mono);font-size:14px;color:var(--amber)">'+peak.toFixed(1)+'</td>';
    html += '<td style="font-family:var(--mono);font-size:15px;font-weight:600;color:var(--green)">₱'+Math.round(x.cost).toLocaleString()+'</td>';
    html += '<td><div style="display:flex;align-items:center;gap:5px"><div style="width:50px;height:5px;background:var(--border);border-radius:3px"><div style="width:'+barW+'%;height:5px;background:var(--blue);border-radius:3px"></div></div><span style="font-size:13px;font-family:var(--mono)">'+pct+'%</span></div></td>';
    html += '</tr>';
  });
  html += '</tbody></table></div>';

  // ── DETAIL TABLE for selected or single store ──
  var detailStores = targetStore ? [targetStore] : [];
  if (detailStores.length > 0) {
    detailStores.forEach(function(store) {
      var rows = getRows(store);
      if (!rows.length) { html += '<div style="color:var(--text3);font-size:15px;padding:10px">No data for this store in selected range.</div>'; return; }

      // Group by view mode
      var grouped = {};
      rows.forEach(function(r) {
        var key = meralcoView==='daily' ? r.date : meralcoView==='weekly' ? weekKey(r.date) : monthKey(r.date);
        if (!grouped[key]) grouped[key] = { kwh:0, count:0, dates:[] };
        grouped[key].kwh += r.kwh;
        grouped[key].count++;
        grouped[key].dates.push(r.date);
      });
      var keys = Object.keys(grouped).sort();

      html += '<div class="sec-title" style="margin-top:14px">📅 '+store.name+' — '+meralcoView.charAt(0).toUpperCase()+meralcoView.slice(1)+' Detail</div>';
      html += '<div class="crew-table-wrap" style="max-height:320px;overflow-y:auto"><table class="crew-table"><thead><tr>';
      html += '<th>Period</th><th>Days</th><th>KWH</th><th>Avg/Day</th><th>Billing (₱)</th>';
      html += '</tr></thead><tbody>';
      keys.forEach(function(k, i) {
        var g = grouped[k];
        var cost = g.kwh * MERALCO_RATE;
        var avg = (g.kwh/g.count).toFixed(1);
        html += '<tr style="'+(i%2===0?'':'background:var(--bg3)')+'">';
        html += '<td style="font-family:var(--mono);font-size:14px;font-weight:500">'+k+'</td>';
        html += '<td style="font-family:var(--mono);font-size:14px">'+g.count+'</td>';
        html += '<td style="font-family:var(--mono);font-size:15px;font-weight:600;color:var(--blue)">'+g.kwh.toFixed(1)+'</td>';
        html += '<td style="font-family:var(--mono);font-size:14px;color:var(--text2)">'+avg+'</td>';
        html += '<td style="font-family:var(--mono);font-size:14px;color:var(--green)">₱'+cost.toFixed(2)+'</td>';
        html += '</tr>';
      });
      html += '</tbody></table></div>';
    });
  }

  wrap.innerHTML = html;
}

function renderApplianceView(wrap) {
  var stores = db.stores || [];
  var isAll = (selectedStoreId === null);
  var targetStore = isAll ? null : stores.find(function(s){return s.id===selectedStoreId;});
  var storeLabel = isAll ? 'All Stores ('+stores.length+')' : (targetStore ? targetStore.name : '—');
  var storeCount = isAll ? stores.length : 1;
  var storeNo = targetStore ? targetStore.storeNo : null;

  // ── HEADER + VIEW TOGGLE ──
  var html = '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:14px;margin-bottom:12px">';
  html += '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:12px">';
  html += '<div>';
  html += '<div style="font-size:13px;font-weight:600">🔌 Appliance Consumption — <span style="color:var(--red)">'+storeLabel+'</span></div>';
  html += '<div style="font-size:14px;color:var(--text2);margin-top:2px">Rate: <b style="color:var(--amber)">₱'+MERALCO_RATE.toFixed(4)+'/kWh</b> &nbsp;·&nbsp; May 2026 Official Meralco Rate</div>';
  html += '</div>';
  // View toggle
  html += '<div style="display:flex;gap:4px;background:var(--bg3);border-radius:var(--rs);padding:3px">';
  ['appliances','allstores','meralco'].forEach(function(m){
    var lbl = m==='appliances' ? '🔌 Appliances' : m==='allstores' ? '🏪 All Stores' : '⚡ Meralco KWH';
    var act = energyViewMode===m;
    html += '<button onclick="setEnergyView(this)" data-val="'+m+'" style="padding:5px 11px;font-size:14px;border:none;border-radius:6px;cursor:pointer;background:'+(act?'var(--bg4)':'transparent')+';color:'+(act?'var(--text)':'var(--text2)')+';font-weight:'+(act?'600':'400')+'">'+lbl+'</button>';
  });
  html += '</div>';
  html += '</div>';

  // ── SETTINGS ROW ──
  html += '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px">';
  html += '<input id="energy-search" type="text" placeholder="🔍 Search appliance..." value="'+energySearch+'" oninput="energySearch=this.value;renderEnergySummary()" style="flex:1;min-width:140px;padding:7px 10px;border:1px solid var(--border2);border-radius:var(--rs);background:var(--bg3);color:var(--text);font-size:15px">';
  html += '<select onchange="energySort=this.value;renderEnergySummary()" style="padding:7px 10px;border:1px solid var(--border2);border-radius:var(--rs);background:var(--bg3);color:var(--text);font-size:15px">';
  [['default','📋 Default'],['kw-hi','⚡ Power: High→Low'],['kw-lo','⚡ Power: Low→High'],['kwh-hi','📊 kWh: High→Low'],['kwh-lo','📊 kWh: Low→High'],['cost-hi','💰 Cost: High→Low'],['cost-lo','💰 Cost: Low→High']].forEach(function(s){
    html += '<option value="'+s[0]+'"'+(energySort===s[0]?' selected':'')+'>'+s[1]+'</option>';
  });
  html += '</select>';
  html += '<input type="number" placeholder="Min kWh" value="'+energyRangeMin+'" oninput="energyRangeMin=this.value;renderEnergySummary()" style="width:80px;padding:7px 8px;border:1px solid var(--border2);border-radius:var(--rs);background:var(--bg3);color:var(--text);font-size:14px">';
  html += '<input type="number" placeholder="Max kWh" value="'+energyRangeMax+'" oninput="energyRangeMax=this.value;renderEnergySummary()" style="width:80px;padding:7px 8px;border:1px solid var(--border2);border-radius:var(--rs);background:var(--bg3);color:var(--text);font-size:14px">';
  html += '</div>';
  // Category chips
  html += '<div style="display:flex;gap:6px;flex-wrap:wrap">';
  [['','All'],['hvac','🌬️ HVAC'],['light','💡 Lighting'],['rte','🍳 RTE'],['cooling','❄️ Cooling'],['pos','🖥️ POS']].forEach(function(c){
    var act = energyCatFilter===c[0];
    html += '<button onclick="setEnergyCat(this)" data-val="'+c[0]+'" style="padding:3px 10px;border-radius:20px;border:1px solid '+(act?'var(--red)':'var(--border2)')+';background:'+(act?'var(--red-bg)':'transparent')+';color:'+(act?'var(--red)':'var(--text2)')+';font-size:14px;cursor:pointer">'+c[1]+'</button>';
  });
  html += '</div>';
  html += '</div>'; // end settings card

  // Filter appliances
  var list = APPLIANCES.slice();
  if (energySearch.trim()) { var q=energySearch.toLowerCase(); list=list.filter(function(a){return a.name.toLowerCase().indexOf(q)!==-1||a.cat.indexOf(q)!==-1;}); }
  if (energyCatFilter) { list=list.filter(function(a){return a.cat===energyCatFilter;}); }
  if (energyRangeMin!=='') { list=list.filter(function(a){return (a.kw*a.hours)>=parseFloat(energyRangeMin);}); }
  if (energyRangeMax!=='') { list=list.filter(function(a){return (a.kw*a.hours)<=parseFloat(energyRangeMax);}); }
  list.sort(function(a,b){
    var ka=a.kw*a.hours,kb=b.kw*b.hours;
    if(energySort==='kw-hi') return b.kw-a.kw;
    if(energySort==='kw-lo') return a.kw-b.kw;
    if(energySort==='kwh-hi') return kb-ka;
    if(energySort==='kwh-lo') return ka-kb;
    if(energySort==='cost-hi') return (kb-ka)*MERALCO_RATE;
    if(energySort==='cost-lo') return (ka-kb)*MERALCO_RATE;
    return 0;
  });

  var grandTotal = APPLIANCES.reduce(function(s,a){return s+a.kw*a.hours;},0);

  html += '<div class="crew-table-wrap" style="margin-bottom:12px"><table class="crew-table"><thead><tr>';
  html += '<th>Appliance</th><th>Cat</th><th>kW</th><th>ON</th><th>OFF</th><th>Hrs</th><th>kWh/Day</th><th>₱/Day</th><th>₱/Month</th>';
  if (!isAll) html += '<th>% Total</th>';
  else html += '<th>₱/Mo (All)</th>';
  html += '</tr></thead><tbody>';

  if (!list.length) { html += '<tr><td colspan="10" style="text-align:center;padding:18px;color:var(--text3);font-size:15px">No appliances match.</td></tr>'; }
  list.forEach(function(a,i){
    var kwh=parseFloat((a.kw*a.hours).toFixed(2));
    var cpd=parseFloat((kwh*MERALCO_RATE).toFixed(2));
    var cpm=parseFloat((kwh*30*MERALCO_RATE).toFixed(2));
    var cpmAll=parseFloat((kwh*30*MERALCO_RATE*storeCount).toFixed(2));
    var pct=grandTotal>0?((kwh/grandTotal)*100).toFixed(1):0;
    var bw=Math.min(100,Math.round(pct*2));
    html+='<tr style="'+(i%2===0?'':'background:var(--bg3)')+'">';
    html+='<td><div style="font-size:14px;font-weight:500">'+a.name+'</div><div style="height:3px;background:var(--border);border-radius:2px;margin-top:4px;width:80px"><div style="height:3px;width:'+bw+'%;background:var(--blue);border-radius:2px"></div></div></td>';
    html+='<td><span style="font-size:13px;padding:2px 6px;border-radius:10px;background:var(--bg4);color:var(--text2)">'+a.cat+'</span></td>';
    html+='<td style="font-family:var(--mono);font-size:14px;color:var(--amber)">'+a.kw+'</td>';
    html+='<td style="font-size:13px;color:var(--green)">'+a.on+'</td>';
    html+='<td style="font-size:13px;color:var(--red)">'+a.off+'</td>';
    html+='<td style="font-family:var(--mono);font-size:14px">'+a.hours+'h</td>';
    html+='<td style="font-family:var(--mono);font-size:15px;font-weight:600;color:var(--blue)">'+kwh+'</td>';
    html+='<td style="font-family:var(--mono);font-size:14px">₱'+cpd.toFixed(0)+'</td>';
    html+='<td style="font-family:var(--mono);font-size:15px;font-weight:600">₱'+cpm.toFixed(0)+'</td>';
    if(!isAll){
      var bc=pct>=20?'var(--red)':pct>=10?'var(--amber)':'var(--green)';
      html+='<td><span style="font-size:14px;font-family:var(--mono);color:'+bc+'">'+pct+'%</span></td>';
    } else {
      html+='<td style="font-family:var(--mono);font-size:14px;color:var(--text2)">₱'+cpmAll.toFixed(0)+'</td>';
    }
    html+='</tr>';
  });
  html += '</tbody></table></div>';

  // Summary cards
  var filteredKwh = list.reduce(function(s,a){return s+a.kw*a.hours;},0);
  var tk=parseFloat(filteredKwh.toFixed(2)), tm=parseFloat((tk*30).toFixed(1));
  var cd=Math.round(tk*MERALCO_RATE), cm=Math.round(tm*MERALCO_RATE);
  var topA = list.slice().sort(function(a,b){return (b.kw*b.hours)-(a.kw*a.hours);})[0];
  html += '<div class="stat-grid" style="margin-bottom:0">';
  html += '<div class="stat-card"><div class="stat-lbl">kWh/Day</div><div class="stat-val" style="color:var(--blue)">'+tk+'</div><div class="stat-trend">'+storeLabel+'</div></div>';
  html += '<div class="stat-card"><div class="stat-lbl">kWh/Month</div><div class="stat-val" style="color:var(--amber)">'+tm+'</div><div class="stat-trend">×30 days</div></div>';
  html += '<div class="stat-card"><div class="stat-lbl">Cost/Day</div><div class="stat-val" style="color:var(--green)">₱'+cd.toLocaleString()+'</div><div class="stat-trend">@ Meralco rate</div></div>';
  html += '<div class="stat-card"><div class="stat-lbl">Cost/Month</div><div class="stat-val" style="color:var(--red)">₱'+cm.toLocaleString()+'</div><div class="stat-trend">'+(isAll?storeCount+' stores combined':'estimated')+'</div></div>';
  if(topA){html+='<div class="stat-card"><div class="stat-lbl">Highest Consumer</div><div class="stat-val" style="font-size:13px;color:var(--amber)">'+parseFloat((topA.kw*topA.hours).toFixed(2))+' kWh</div><div class="stat-trend" style="white-space:normal;line-height:1.3">'+topA.name+'</div></div>';}
  html += '</div>';
  wrap.innerHTML = html;
}

// ── ENERGY VIEW HELPER FUNCTIONS ──
function setEnergyView(el) { energyViewMode = el.getAttribute('data-val'); renderEnergySummary(); }
function setMeralcoView(el) { meralcoView = el.getAttribute('data-val'); renderEnergySummary(); }
function setEnergyCat(el) { energyCatFilter = el.getAttribute('data-val'); renderEnergySummary(); }
function clearMeralcoDates() { meralcoDateFrom = ''; meralcoDateTo = ''; renderEnergySummary(); }

// ── SCHEDULED CHECKLIST REMINDERS (CLIENT-SIDE NOTIFICATION) ──
var _schedFired = {};
function checkScheduledReminders() {
  var now = new Date();
  var h = now.getHours(), m = now.getMinutes();
  var today = now.toDateString();
  // Compliance rate tiers for client display
  var COMPLIANCE_TIERS_CLIENT = [
    {maxMin:10,pct:100},{maxMin:20,pct:90},{maxMin:30,pct:80},
    {maxMin:40,pct:70},{maxMin:60,pct:50},{maxMin:90,pct:0}
  ];
  var schedules = [
    { h:7,  m:0,  key:'7am',   graceMins:90, msg:'🌅 7AM OPEN: Complete AC & opening tasks. Attach photos! ⏱ 20 min grace (100%→0% at 90 min)' },
    { h:17, m:40, key:'540pm', graceMins:90, msg:'💡 5:40PM: Turn ON Flood Light, Façade, Pylon & Canopy! ⏱ 20 min grace' },
    { h:0,  m:0,  key:'12mn',  graceMins:90, msg:'🔴 12MN: Unplug all RTE equipment & turn off selling lights! ⏱ 20 min grace' },
  ];
  schedules.forEach(function(s) {
    var fkey = s.key+'_'+today;
    if(h===s.h && m===s.m && !_schedFired[fkey]) {
      _schedFired[fkey] = true;
      toast('⏰ '+s.msg);
      // Also show browser notification if permitted
      if(window.Notification && Notification.permission==='granted') {
        new Notification('Alfamart Energy Checklist', { body: s.msg, icon: '' });
      }
    }
  });
}
// Request browser notification permission
if(window.Notification && Notification.permission==='default') {
  Notification.requestPermission();
}
setInterval(checkScheduledReminders, 30000);

// ── OFFLINE QUEUE SYNC ──
async function syncOfflineQueue(){
  if(!offlineQueue.length) return;
  var remaining=[];
  for(var i=0;i<offlineQueue.length;i++){
    var data=await apiFetch('POST','/api/submit',offlineQueue[i]);
    if(!data) remaining.push(offlineQueue[i]);
  }
  offlineQueue=remaining;
  if(!remaining.length){ await syncDB(); toast('🔄 Offline submissions synced!'); }
}
setInterval(syncOfflineQueue, 15000);

// ── PWA SERVICE WORKER REGISTRATION ──
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js').then(function(reg) {
      console.log('[PWA] Service worker registered:', reg.scope);
    }).catch(function(err) {
      console.warn('[PWA] SW registration failed:', err);
    });
  });
}

// ── PWA INSTALL PROMPT (Android "Add to Home Screen") ──
var _pwaPrompt = null;
window.addEventListener('beforeinstallprompt', function(e) {
  e.preventDefault();
  _pwaPrompt = e;
  // Show install banner after 3 seconds if not already installed
  setTimeout(function() {
    var bar = document.getElementById('pwa-install-bar');
    if (bar) bar.style.display = 'flex';
  }, 3000);
});

function installPWA() {
  var bar = document.getElementById('pwa-install-bar');
  if (bar) bar.style.display = 'none';
  if (_pwaPrompt) {
    _pwaPrompt.prompt();
    _pwaPrompt.userChoice.then(function(result) {
      if (result.outcome === 'accepted') toast('✅ App installed! Find AlfaEnergy on your home screen.');
      _pwaPrompt = null;
    });
  }
}

window.addEventListener('appinstalled', function() {
  toast('✅ AlfaEnergy installed on this device!');
  var bar = document.getElementById('pwa-install-bar');
  if (bar) bar.style.display = 'none';
});

// ── RESTORE SESSION (runs last, after all functions are defined) ──
(function restoreSession() {
  try {
    var key = sessionKey();
    var saved = localStorage.getItem(key);
    if (!saved) return;
    var user = JSON.parse(saved);
    if (!user || !user.id) return;
    currentUser = user;
    var ls = document.getElementById('login-screen');
    var ap = document.getElementById('app');
    var av = document.getElementById('user-av');
    var nl = document.getElementById('user-name-lbl');
    var vs = document.getElementById('view-switcher');
    if (ls) ls.style.display = 'none';
    if (ap) ap.classList.add('visible');
    if (av) av.textContent = user.name.split(' ').map(function(w){return w[0]||'';}).join('').slice(0,2).toUpperCase();
    if (nl) nl.textContent = user.name;
    if (vs) vs.style.display = 'none';
    if (user.role === 'crew') {
      switchView('mobile');
      // init mobile ONCE on restore
      try { initMobile(); } catch(e){ console.warn('initMobile err',e); }
    } else {
      switchView('server');
    }
    // Sync without blocking restore
    setTimeout(function(){ try{ syncDB(); }catch(e){} }, 300);
  } catch(e) {
    console.warn('Session restore error:', e);
    // Do NOT clear session — prevents reload logout
  }
})();
// toggleApprovedHistory is defined in dashboard.js — do not redefine here
