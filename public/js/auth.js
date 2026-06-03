/**
 * auth.js — Alfamart Energy Checklist
 * Alfamart Energy Monitoring System
 */

// ════════════════════════════════════════════════════════
// LOGIN
// ════════════════════════════════════════════════════════
var pinEntry = '';

(function buildPinPad() {
  var g = document.getElementById('pin-grid');
  var nums = [1,2,3,4,5,6,7,8,9,'',0,'⌫'];
  nums.forEach(function(n) {
    var btn = document.createElement('button');
    btn.className='pin-btn';
    btn.textContent = n===''?'':String(n);
    if(n==='') { btn.style.visibility='hidden'; }
    else if(n==='⌫') { btn.onclick = function(){ pinEntry=pinEntry.slice(0,-1); updatePinDisplay(); document.getElementById('login-err').textContent=''; }; }
    else { (function(val){ btn.onclick = function(){ pinTap(String(val)); }; })(n); }
    g.appendChild(btn);
  });
})();

function pinTap(n) {
  if(pinEntry.length>=4) return;
  pinEntry += n;
  updatePinDisplay();
  if(pinEntry.length===4) setTimeout(doLogin,120);
}
function pinClear() { pinEntry=''; updatePinDisplay(); document.getElementById('login-err').textContent=''; }
function updatePinDisplay() {
  for(var i=0;i<4;i++) {
    document.getElementById('pd'+i).classList.toggle('filled', i<pinEntry.length);
  }
}

async function doLogin() {
  var data = await apiFetch('POST','/api/login',{pin:pinEntry});
  if (!data || data.error) {
    // Fallback: try default users if server offline
    var fallback = [{id:'mgr1',name:'Store Manager',role:'manager',pin:'5006',storeId:null},
                    {id:'crew1',name:'Manabat Crew',role:'crew',pin:'1642',storeId:'manabat'},
                    {id:'crew2',name:'Halang Crew',role:'crew',pin:'1641',storeId:'halang'},
                    {id:'crew3',name:'Tatlong Crew',role:'crew',pin:'1640',storeId:'tatlong'},
                    {id:'crew4',name:'Interior Crew',role:'crew',pin:'3137',storeId:'interior'},
                    {id:'crew5',name:'Banaybanay Crew',role:'crew',pin:'5682',storeId:'banay'},
                    {id:'crew6',name:'Timbao Crew',role:'crew',pin:'1654',storeId:'timbao'}];
    var u = fallback.find(function(x){ return x.pin===pinEntry; });
    if(!u) { document.getElementById('login-err').textContent='Invalid PIN. Try again.'; pinEntry=''; updatePinDisplay(); return; }
    loginSuccess(u);
  } else {
    loginSuccess(data.user);
  }
}

function loginSuccess(user) {
  // Reset local state for new user/store — prevents bleed
  localTasks = {};
  localTemps = {};
  currentUser = user;
  localStorage.setItem(sessionKey(), JSON.stringify(user));
  try { document.getElementById('login-screen').style.display='none'; } catch(e){}
  try { document.getElementById('app').classList.add('visible'); } catch(e){}
  try {
    var initials = (user.name||'').split(' ').map(function(w){return w[0]||'';}).join('').slice(0,2).toUpperCase();
    document.getElementById('user-av').textContent = initials;
    document.getElementById('user-name-lbl').textContent = user.name;
  } catch(e){}
  try { document.getElementById('view-switcher').style.display = 'none'; } catch(e){}
  if(user.role === 'crew') {
    switchView('mobile');
    try { initMobile(); } catch(e){ console.warn('initMobile err',e); }
  } else {
    switchView('server');
  }
  setTimeout(function(){ try{ syncDB(); }catch(e){} }, 200);
}

function logout() {
  // Clear all local state before logout
  localTasks = {};
  localTemps = {};
  currentUser=null; pinEntry=''; updatePinDisplay();
  localStorage.removeItem(sessionKey());
  try { document.getElementById('app').classList.remove('visible'); } catch(e){}
  try { document.getElementById('login-screen').style.display='flex'; } catch(e){}
  try { document.getElementById('login-err').textContent=''; } catch(e){}
}

