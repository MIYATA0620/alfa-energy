/**
 * config.js — Alfamart Energy Checklist
 * Alfamart Energy Monitoring System
 */

// ════════════════════════════════════════════════════════
// CONFIG
// ════════════════════════════════════════════════════════
var API = ''; // empty = same origin (local server)
var POLL_INTERVAL = 5000; // 5 seconds auto-sync
var currentUser = null;

// ── SESSION KEY (tab-unique localStorage key) ──
function sessionKey() {
  // Fixed key — persists across reloads in same browser
  return 'alfamart_session_v4';
}

// restoreSession() is called at the BOTTOM of the script after all functions load

var db = { stores:[], submissions:[], tempLogs:[], notifications:[], users:[] };

// ── CHECKLIST DEFINITION (from Excel) ──
var CHECKLIST = [
  { id:'hvac', icon:'🌬️', name:'Air Conditioning / Ventilation (HVAC)', tasks:[
    { id:'ac-open',  name:'Turn ON AC — Opening Check',               time:'7:00 AM' },
    { id:'ac-close', name:'Turn OFF / Set Economy Mode',              time:'10:00 PM' },
  ]},
  { id:'lighting', icon:'💡', name:'Lighting Efficiency', tasks:[
    { id:'fl-on',    name:'Flood Light — Turn ON',                    time:'5:40 PM' },
    { id:'fl-off',   name:'Flood Light — Turn OFF',                   time:'12:00 MN' },
    { id:'fa-on',    name:'Façade Light — Turn ON',                   time:'5:40 PM' },
    { id:'fa-off',   name:'Façade Light — Turn OFF',                  time:'12:00 MN' },
    { id:'py-on',    name:'Pylon Sign — Turn ON',                     time:'5:40 PM' },
    { id:'py-off',   name:'Pylon Sign — Turn OFF',                    time:'12:00 MN' },
    { id:'can-off',  name:'Canopy Lights — Turn OFF',                 time:'12:00 MN' },
    { id:'sell',     name:'Selling Area: 50% @ 6AM → ALL @ 10AM → OFF @ 12MN', time:'6AM/10AM/12MN' },
    { id:'stock',    name:'Stockroom / Backdoor / CR — OFF when not in use', time:'12:00 MN' },
  ]},
  { id:'equip', icon:'🔌', name:'Equipment (Unplug at 12MN)', tasks:[
    { id:'pos',      name:'POS / Server (GY: Restart 12:30AM)',       time:'12:00 MN' },
    { id:'rice',     name:'RTE Rice Cooker — Unplug',                 time:'12:00 MN' },
    { id:'boiler',   name:'RTE Boiler — Unplug',                      time:'12:00 MN' },
    { id:'steamer',  name:'RTE Steamer — Unplug',                     time:'12:00 MN' },
    { id:'fryer',    name:'RTE Fryer — Unplug',                       time:'12:00 MN' },
    { id:'kettle',   name:'RTE Kettle — Unplug',                      time:'12:00 MN' },
  ]},
  { id:'freezer', icon:'❄️', name:'Freezer Maintenance', tasks:[
    { id:'fz-door',  name:'Freezer doors fully closed',               time:'Daily' },
    { id:'fz-ice',   name:'No ice build-up on surfaces',              time:'Daily' },
    { id:'fz-temp',  name:'Temperature display working (≤ −18°C)',    time:'Daily' },
    { id:'fz-noise', name:'No unusual noise or vibration',            time:'Daily' },
    { id:'fz-leak',  name:'No water leakage around unit',             time:'Daily' },
    { id:'fz-air',   name:'Products arranged — no blocked airflow',   time:'Daily' },
    { id:'fz-gas',   name:'Door gaskets airtight and not damaged',    time:'Daily' },
  ]},
  { id:'chiller', icon:'🧊', name:'Chiller Checklist', tasks:[
    { id:'ch-door',  name:'Chiller doors fully closed',               time:'Daily' },
    { id:'ch-temp',  name:'Temperature 2°C – 5°C (display working)',  time:'Daily' },
    { id:'ch-leak',  name:'No water leakage',                         time:'Daily' },
    { id:'ch-clean', name:'Interior shelves cleaned and sanitized',   time:'Daily' },
    { id:'ch-gas',   name:'Door gaskets clean and sealing properly',  time:'Daily' },
    { id:'ch-drain', name:'Drain outlet not clogged',                 time:'Daily' },
    { id:'ch-on',    name:'Turn ON all 7AM / Turn OFF 10PM (except Dairy)', time:'7AM / 10PM' },
  ]},
];

// ── PER-STORE TEMPERATURE UNITS ──
// Each store has opening (7AM) and closing (10PM) equipment lists
var STORE_TEMP_DATA = {
  manabat: {
    opening: {
      freezers: [
        {no:1, name:'Tube Ice',                         target:-10},
        {no:2, name:'Poultry / Cut Ups',                target:-23},
        {no:3, name:'Fish Freezer',                     target:-18},
        {no:4, name:'Balls',                            target:-18},
        {no:5, name:'Deli',                             target:-23},
        {no:6, name:'Beef Freezer',                     target:-23},
        {no:7, name:'Pork',                             target:-23},
        {no:8, name:'Poultry',                          target:-23},
        {no:9, name:'Binggrae',                         target:-18},
        {no:10,name:'Tube Ice (2)',                     target:-10},
        {no:11,name:'Upright Freezer (Processed Food)', target:-18},
        {no:12,name:'Back Up Freezer (Storage Room)',   target:-10},
        {no:13,name:'Hard Top Freezer (Tube Ice)',      target:-10},
      ],
      chillers: [
        {no:1, name:'Alcoholic Beverages / Beer', target:5},
        {no:2, name:'Drinks',                     target:5},
        {no:3, name:'Drinks / Milk',              target:4},
        {no:4, name:'SM Bonus',                   target:5},
      ]
    },
    closing: {
      freezers: [
        {no:1, name:'Tube Ice',                         target:-10},
        {no:2, name:'Poultry / Cut Ups',                target:-23},
        {no:3, name:'Fish Freezer',                     target:-18},
        {no:4, name:'Balls',                            target:-18},
        {no:5, name:'Deli',                             target:-23},
        {no:6, name:'Beef Freezer',                     target:-23},
        {no:7, name:'Pork',                             target:-23},
        {no:8, name:'Poultry',                          target:-23},
        {no:9, name:'Binggrae',                         target:-18},
        {no:10,name:'Tube Ice (2)',                     target:-10},
        {no:11,name:'Upright Freezer (Processed Food)', target:-18},
        {no:12,name:'Back Up Freezer (Storage Room)',   target:-10},
        {no:13,name:'Hard Top Freezer (Tube Ice)',      target:-10},
      ],
      chillers: [
        {no:1, name:'Alcoholic Beverages / Beer', target:5},
        {no:2, name:'Drinks',                     target:5},
        {no:3, name:'Drinks / Milk',              target:4},
        {no:4, name:'SM Bonus',                   target:5},
      ]
    }
  },
  halang: {
    opening: {
      freezers: [
        {no:1, name:'Processed Foods (1)',         target:-18},
        {no:2, name:'Beef',                        target:-23},
        {no:3, name:'Pork',                        target:-23},
        {no:4, name:'Poultry / Cut Ups',           target:-23},
        {no:5, name:'Processed Foods (2)',         target:-18},
        {no:6, name:'Deli',                        target:-23},
        {no:7, name:'Balls',                       target:-18},
        {no:8, name:'Seafood (1)',                 target:-18},
        {no:9, name:'Seafood (2)',                 target:-18},
        {no:10,name:'Poultry',                     target:-23},
        {no:11,name:'Veggies / Fries',             target:-18},
        {no:12,name:'Tube Ice (1)',                target:-10},
        {no:13,name:'Tube Ice (2)',                target:-10},
        {no:14,name:'Deli / Upright Freezer',      target:-23},
        {no:15,name:'Binggrae',                    target:-18},
        {no:16,name:'Storage Freezer / Backup',    target:-10},
        {no:17,name:'Storage Freezer',             target:-10},
      ],
      chillers: [
        {no:1, name:'Alcoholic Beverages',         target:5},
        {no:2, name:'Drinks',                      target:5},
        {no:3, name:'Juices / Coffee',             target:5},
        {no:4, name:'Milk / Dairy',                target:4},
        {no:5, name:'Drinks / Additional Beverages',target:5},
      ]
    },
    closing: {
      freezers: [
        {no:1, name:'Processed Foods (1)',         target:-18},
        {no:2, name:'Beef',                        target:-23},
        {no:3, name:'Pork',                        target:-23},
        {no:4, name:'Poultry / Cut Ups',           target:-23},
        {no:5, name:'Processed Foods (2)',         target:-18},
        {no:6, name:'Deli',                        target:-23},
        {no:7, name:'Balls',                       target:-18},
        {no:8, name:'Seafood (1)',                 target:-18},
        {no:9, name:'Seafood (2)',                 target:-18},
        {no:10,name:'Poultry',                     target:-23},
        {no:11,name:'Veggies / Fries',             target:-18},
        {no:12,name:'Tube Ice (1)',                target:-10},
        {no:13,name:'Tube Ice (2)',                target:-10},
        {no:14,name:'Deli / Upright Freezer',      target:-23},
        {no:15,name:'Binggrae',                    target:-18},
        {no:16,name:'Storage Freezer / Backup',    target:-10},
        {no:17,name:'Storage Freezer',             target:-10},
      ],
      chillers: [
        {no:1, name:'Alcoholic Beverages',         target:5},
        {no:2, name:'Drinks',                      target:5},
        {no:3, name:'Juices / Coffee',             target:5},
        {no:4, name:'Milk / Dairy',                target:4},
        {no:5, name:'Drinks / Additional Beverages',target:5},
      ]
    }
  },
  tatlong: {
    opening: {
      freezers: [
        {no:2, name:'Beef',                        target:-23},
        {no:3, name:'Balls and Seafood',           target:-18},
        {no:4, name:'Seafoods',                    target:-18},
        {no:5, name:'Processed Food',              target:-18},
        {no:6, name:'Deli',                        target:-23},
        {no:7, name:'Whole Chicken',               target:-23},
        {no:8, name:'Alfa Cuts',                   target:-23},
        {no:9, name:'Hardtop Freezer',             target:-10},
        {no:10,name:'Binggrae',                    target:-18},
        {no:11,name:'Additional Freezer',          target:-18},
        {no:12,name:'Back Up Freezer',             target:-10},
      ],
      chillers: [
        {no:1, name:'Chilled Freezer',             target:5},
        {no:2, name:'Dairy / RTD',                 target:4},
        {no:3, name:'Juices',                      target:5},
        {no:4, name:'Energy & Bottled Drink',      target:5},
        {no:5, name:'Carbonated',                  target:5},
        {no:6, name:'Alcoholic Drink',             target:5},
      ]
    },
    closing: {
      freezers: [
        {no:2, name:'Beef',                        target:-23},
        {no:3, name:'Balls and Seafood',           target:-18},
        {no:4, name:'Seafoods',                    target:-18},
        {no:5, name:'Processed Food',              target:-18},
        {no:6, name:'Deli',                        target:-23},
        {no:7, name:'Whole Chicken',               target:-23},
        {no:8, name:'Alfa Cuts',                   target:-23},
        {no:9, name:'Hardtop Freezer',             target:-10},
        {no:10,name:'Binggrae',                    target:-18},
        {no:11,name:'Additional Freezer',          target:-18},
        {no:12,name:'Back Up Freezer',             target:-10},
      ],
      chillers: [
        {no:1, name:'Chilled Freezer',             target:5},
        {no:2, name:'Dairy / RTD',                 target:4},
        {no:3, name:'Juices',                      target:5},
        {no:4, name:'Energy & Bottled Drink',      target:5},
        {no:5, name:'Carbonated',                  target:5},
        {no:6, name:'Alcoholic Drink',             target:5},
      ]
    }
  },
  interior: {
    opening: {
      freezers: [
        {no:1, name:'Poultry',                     target:-23},
        {no:2, name:'Pork',                        target:-23},
        {no:3, name:'Beef',                        target:-23},
        {no:4, name:'Processed Meat',              target:-18},
        {no:5, name:'Deli',                        target:-23},
        {no:6, name:'Seafood',                     target:-18},
        {no:7, name:'Balls',                       target:-18},
        {no:8, name:'Tube Ice',                    target:-10},
        {no:9, name:'Back Up Freezer',             target:-10},
      ],
      chillers: [
        {no:1, name:'Coke Freezer',                target:5},
        {no:2, name:'Alcoholic / Carbonated',      target:5},
        {no:3, name:'Juices',                      target:5},
        {no:4, name:'Milk / Dairy',                target:4},
      ]
    },
    closing: {
      freezers: [
        {no:1, name:'Poultry',                     target:-23},
        {no:2, name:'Pork',                        target:-23},
        {no:3, name:'Beef',                        target:-23},
        {no:4, name:'Processed Meat',              target:-18},
        {no:5, name:'Deli',                        target:-23},
        {no:6, name:'Seafood',                     target:-18},
        {no:7, name:'Balls',                       target:-18},
        {no:8, name:'Tube Ice',                    target:-10},
        {no:9, name:'Back Up Freezer',             target:-10},
      ],
      chillers: [
        {no:1, name:'Coke Freezer',                target:5},
        {no:2, name:'Alcoholic / Carbonated',      target:5},
        {no:3, name:'Juices',                      target:5},
        {no:4, name:'Milk / Dairy',                target:4},
      ]
    }
  },
  banay: {
    opening: {
      freezers: [
        {no:1, name:'Processed Meats',             target:-18},
        {no:2, name:'Beef',                        target:-23},
        {no:3, name:'Pork',                        target:-23},
        {no:4, name:'Poultry / Cut Ups',           target:-23},
        {no:5, name:'Deli',                        target:-23},
        {no:6, name:'Seafood',                     target:-18},
        {no:7, name:'Processed Foods',             target:-18},
        {no:8, name:'Tube Ice',                    target:-10},
        {no:9, name:'Storage Freezer',             target:-10},
      ],
      chillers: [
        {no:1, name:'Dairy / Milk',                target:4},
        {no:2, name:'Juices',                      target:5},
        {no:3, name:'Drinks / Alcoholic Beverages',target:5},
      ]
    },
    closing: {
      freezers: [
        {no:1, name:'Processed Meats',             target:-18},
        {no:2, name:'Beef',                        target:-23},
        {no:3, name:'Pork',                        target:-23},
        {no:4, name:'Poultry / Cut Ups',           target:-23},
        {no:5, name:'Deli',                        target:-23},
        {no:6, name:'Seafood',                     target:-18},
        {no:7, name:'Processed Foods',             target:-18},
        {no:8, name:'Tube Ice',                    target:-10},
        {no:9, name:'Storage Freezer',             target:-10},
      ],
      chillers: [
        {no:1, name:'Dairy / Milk',                target:4},
        {no:2, name:'Juices',                      target:5},
        {no:3, name:'Drinks / Alcoholic Beverages',target:5},
      ]
    }
  },
  timbao: {
    opening: {
      freezers: [
        {no:1, name:'Poultry',                     target:-23},
        {no:2, name:'Pork',                        target:-23},
        {no:3, name:'Beef',                        target:-23},
        {no:4, name:'Processed Meat',              target:-18},
        {no:5, name:'Deli',                        target:-23},
        {no:6, name:'Balls / Veggies',             target:-18},
        {no:7, name:'Seafood',                     target:-18},
        {no:8, name:'Tube Ice',                    target:-10},
        {no:9, name:'Binggrae',                    target:-18},
        {no:10,name:'CDO Highlight Freezer',       target:-18},
        {no:11,name:'Storage',                     target:-10},
        {no:12,name:'Storage / Tube Ice Backup',   target:-10},
      ],
      chillers: [
        {no:1, name:'Alcoholic Beverages',         target:5},
        {no:2, name:'Carbonated',                  target:5},
        {no:3, name:'Chilled Drinks (1)',           target:5},
        {no:4, name:'Chilled Drinks (2)',           target:5},
        {no:5, name:'Dairy',                       target:4},
        {no:6, name:'Yakult',                      target:4},
      ]
    },
    closing: {
      freezers: [
        {no:1, name:'Poultry',                     target:-23},
        {no:2, name:'Pork',                        target:-23},
        {no:3, name:'Beef',                        target:-23},
        {no:4, name:'Processed Meat',              target:-18},
        {no:5, name:'Deli',                        target:-23},
        {no:6, name:'Balls / Veggies',             target:-18},
        {no:7, name:'Seafood',                     target:-18},
        {no:8, name:'Tube Ice',                    target:-10},
        {no:9, name:'Binggrae',                    target:-18},
        {no:10,name:'CDO Highlight Freezer',       target:-18},
        {no:11,name:'Storage',                     target:-10},
        {no:12,name:'Storage / Tube Ice Backup',   target:-10},
      ],
      chillers: [
        {no:1, name:'Alcoholic Beverages',         target:5},
        {no:2, name:'Carbonated',                  target:5},
        {no:3, name:'Chilled Drinks (1)',           target:5},
        {no:4, name:'Chilled Drinks (2)',           target:5},
        {no:5, name:'Dairy',                       target:4},
        {no:6, name:'Yakult',                      target:4},
      ]
    }
  }
};

// Temp log lock state: {storeId}_{date}_{shift} = true if submitted
var tempLogLocked = {};
var currentTempShift = null; // 'opening' or 'closing'

function getTodayKey() {
  return new Date().toISOString().slice(0,10);
}

function detectTempShift() {
  var h = new Date().getHours();
  // 5AM reset: both shifts reopen at 5AM
  // Opening: 5AM-11:59AM; Closing: 12PM onwards
  return (h >= 5 && h < 12) ? 'opening' : 'closing';
}

function isTempShiftLocked(shift) {
  if (!currentUser || !currentUser.storeId) return false;
  var k = currentUser.storeId + '_' + getTodayKey() + '_' + shift;
  // Also check localStorage for persistence
  var stored = localStorage.getItem('tempLock_' + k);
  return stored === '1' || !!tempLogLocked[k];
}

function lockTempShift(shift) {
  if (!currentUser || !currentUser.storeId) return;
  var k = currentUser.storeId + '_' + getTodayKey() + '_' + shift;
  tempLogLocked[k] = true;
  localStorage.setItem('tempLock_' + k, '1');
  // Clear locks older than today at 5AM reset
  clearOldTempLocks();
}

function clearOldTempLocks() {
  var today = getTodayKey();
  var h = new Date().getHours();
  if (h >= 5) {
    // Remove yesterday's locks
    var yesterday = new Date(Date.now()-86400000).toISOString().slice(0,10);
    Object.keys(localStorage).forEach(function(k){
      if (k.startsWith('tempLock_') && k.indexOf(yesterday) !== -1) {
        localStorage.removeItem(k);
      }
    });
  }
}

function getStoreTempUnits() {
  if (!currentUser || !currentUser.storeId) return null;
  var data = STORE_TEMP_DATA[currentUser.storeId];
  if (!data) return null;
  currentTempShift = detectTempShift();
  return data[currentTempShift];
}

function getCurrentShiftLabel() {
  var shift = detectTempShift();
  return shift === 'opening' ? '🌅 Opening (7AM)' : '🌙 Closing (10PM)';
}

// ── LOCAL STATE ──
var localTasks = {}; // taskId → {status, remark, pics, done}

function localTasksKey() {
  if (!currentUser || !currentUser.storeId) return null;
  var now = new Date();
  var cutoff = new Date(now);
  if (now.getHours() < 5) cutoff.setDate(cutoff.getDate()-1);
  cutoff.setHours(5,0,0,0);
  // Key includes date of the current "day" (resets at 5AM)
  var dayStr = cutoff.toISOString().slice(0,10);
  return 'localTasks_' + currentUser.storeId + '_' + dayStr;
}

function saveLocalTasks() {
  var key = localTasksKey();
  if (!key) return;
  try { localStorage.setItem(key, JSON.stringify(localTasks)); } catch(e) {}
}

function loadLocalTasks() {
  // ALWAYS reset first — prevents bleed from other stores/sessions
  localTasks = {};
  var key = localTasksKey();
  if (!key) return;
  try {
    var saved = localStorage.getItem(key);
    if (saved) {
      var parsed = JSON.parse(saved);
      // Extra guard: only load tasks that belong to this store's day key
      localTasks = parsed || {};
    }
  } catch(e) { localTasks = {}; }
}
var localTemps = {}; // key → value
var openCats = { hvac:true, lighting:false, equip:false, freezer:false, chiller:false };
var offlineQueue = [];

// ── SESSION RESTORE ──
// Called once all JS files are loaded (invoked at bottom of index.html).
// If a valid session exists in localStorage, skip the login screen.
function restoreSession() {
  try {
    var saved = localStorage.getItem(sessionKey());
    if (saved) {
      var user = JSON.parse(saved);
      if (user && user.id && user.pin) {
        loginSuccess(user);
        return;
      }
    }
  } catch(e) {}
  // No valid session — show login screen normally
  try { document.getElementById('login-screen').style.display = 'flex'; } catch(e) {}
}

