/**
 * server.js — Alfamart Energy Checklist
 * Node.js HTTP server with REST API, file-based JSON storage,
 * and scheduled compliance notifications.
 */

'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const url  = require('url');
const os   = require('os');

// ── CONSTANTS ─────────────────────────────────────────────
const PORT        = process.env.PORT || 3000;
const DB_PATH     = path.join(__dirname, 'data', 'db.json');
const PUBLIC_PATH = path.join(__dirname, 'public');

// ── SECURITY ───────────────────────────────────────────────
// Secret path prefix — the app is ONLY accessible at /atp/...
// Anyone guessing the plain IP just gets a 404.
// Change SITE_KEY to any word you want (no spaces, lowercase).
const SITE_KEY    = 'atp';           // → http://alfacheck:3000/atp/
const APP_TOKEN   = 'alfamart-2026'; // sent as X-App-Token header by the client
                                     // (set matching value in your index.html apiFetch)

// ── RATE LIMITER — login endpoint only ────────────────────
// Blocks IP after 5 failed PIN attempts within 15 minutes.
const loginAttempts = {};  // { ip: { count, firstAt } }
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_MS  = 15 * 60 * 1000; // 15 minutes

function isRateLimited(ip) {
  const now = Date.now();
  if (!loginAttempts[ip]) return false;
  const { count, firstAt } = loginAttempts[ip];
  if (now - firstAt > RATE_LIMIT_MS) { delete loginAttempts[ip]; return false; }
  return count >= RATE_LIMIT_MAX;
}

function recordFailedAttempt(ip) {
  const now = Date.now();
  if (!loginAttempts[ip] || Date.now() - loginAttempts[ip].firstAt > RATE_LIMIT_MS) {
    loginAttempts[ip] = { count: 1, firstAt: now };
  } else {
    loginAttempts[ip].count++;
  }
}

function clearAttempts(ip) { delete loginAttempts[ip]; }

// ── MIME TYPE MAP ─────────────────────────────────────────
const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
  '.svg':  'image/svg+xml',
  '.woff2':'font/woff2',
};

// ── CORS HEADERS ──────────────────────────────────────────
const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ═══════════════════════════════════════════════════════════
// DATABASE HELPERS
// ═══════════════════════════════════════════════════════════

function loadDB() {
  if (!fs.existsSync(DB_PATH)) return initDB();
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch (e) {
    console.error('[DB] Parse error, reinitializing:', e.message);
    return initDB();
  }
}

function saveDB(db) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error('[DB] Save error:', e.message);
  }
}

function initDB() {
  const db = {
    stores: [
      { id: 'manabat',  name: 'ATP M MANABAT ST BINAN',            storeNo: '1642', short: 'MN', storeStatus: 'Opening' },
      { id: 'halang',   name: 'ATP HALANG BINAN',                   storeNo: '1641', short: 'HL', storeStatus: 'Opening' },
      { id: 'tatlong',  name: 'ATP TATLONG HARI STA ROSA',          storeNo: '1640', short: 'TH', storeStatus: 'Opening' },
      { id: 'interior', name: 'ATP INTERIOR LT BRGY IBABA STA ROSA',storeNo: '3137', short: 'IN', storeStatus: 'Opening' },
      { id: 'banay',    name: 'ATP BANAYBANAY CABUYAO LAGUNA',      storeNo: '5682', short: 'BB', storeStatus: 'Opening' },
      { id: 'timbao',   name: 'ATP TIMBAO ROAD BINAN',              storeNo: '1654', short: 'TB', storeStatus: 'Opening' },
    ],
    submissions:    [],
    tempLogs:       [],
    notifications:  [],
    complianceLogs: {},
    users: [
      { id: 'mgr1',  name: 'Store Manager',   role: 'manager', pin: '5006', storeId: null      },
      { id: 'crew1', name: 'Manabat Crew',     role: 'crew',    pin: '1642', storeId: 'manabat'  },
      { id: 'crew2', name: 'Halang Crew',      role: 'crew',    pin: '1641', storeId: 'halang'   },
      { id: 'crew3', name: 'Tatlong Crew',     role: 'crew',    pin: '1640', storeId: 'tatlong'  },
      { id: 'crew4', name: 'Interior Crew',    role: 'crew',    pin: '3137', storeId: 'interior' },
      { id: 'crew5', name: 'Banaybanay Crew',  role: 'crew',    pin: '5682', storeId: 'banay'    },
      { id: 'crew6', name: 'Timbao Crew',      role: 'crew',    pin: '1654', storeId: 'timbao'   },
    ],
  };
  saveDB(db);
  return db;
}

// ═══════════════════════════════════════════════════════════
// REQUEST HELPERS
// ═══════════════════════════════════════════════════════════

/** Parse JSON request body safely */
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 20e6) { req.destroy(); reject(new Error('Body too large')); }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch (e) { resolve({}); }
    });
    req.on('error', reject);
  });
}

/** Send a JSON response */
function json(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type':   'application/json',
    'Content-Length': Buffer.byteLength(body),
    ...CORS_HEADERS,
  });
  res.end(body);
}

/** Send a 404 */
function notFound(res) {
  json(res, { error: 'Not found' }, 404);
}

// ═══════════════════════════════════════════════════════════
// COMPLIANCE HELPERS
// ═══════════════════════════════════════════════════════════

const COMPLIANCE_TIERS = [
  { maxMin: 10, pct: 100 },
  { maxMin: 20, pct: 90  },
  { maxMin: 30, pct: 80  },
  { maxMin: 40, pct: 70  },
  { maxMin: 60, pct: 50  },
  { maxMin: 90, pct: 0   },
];

function getComplianceRate(minutesLate) {
  for (const tier of COMPLIANCE_TIERS) {
    if (minutesLate <= tier.maxMin) return tier.pct;
  }
  return 0;
}

// ═══════════════════════════════════════════════════════════
// API ROUTE HANDLERS
// ═══════════════════════════════════════════════════════════

const API_ROUTES = {

  // GET /api/db — full state snapshot for client
  'GET /api/db': async (req, res) => {
    const db = loadDB();
    json(res, db);
  },

  // POST /api/login — PIN authentication (rate-limited)
  'POST /api/login': async (req, res) => {
    const ip = req.socket.remoteAddress || 'unknown';
    if (isRateLimited(ip)) {
      return json(res, { error: 'Too many attempts. Try again in 15 minutes.' }, 429);
    }
    const body = await parseBody(req);
    const db   = loadDB();
    const user = db.users.find(u => u.pin === body.pin);
    if (!user) {
      recordFailedAttempt(ip);
      console.warn(`[LOGIN] Failed attempt from ${ip} (${(loginAttempts[ip]||{count:1}).count}/${RATE_LIMIT_MAX})`);
      return json(res, { error: 'Invalid PIN' }, 401);
    }
    clearAttempts(ip);
    json(res, { user });
  },

  // POST /api/submit — crew submits a checklist task
  'POST /api/submit': async (req, res) => {
    const body = await parseBody(req);
    const db   = loadDB();
    const sub  = {
      id:          Date.now().toString(),
      storeId:     body.storeId,
      storeName:   body.storeName,
      crew:        body.crew,
      crewId:      body.crewId,
      taskId:      body.taskId,
      taskName:    body.taskName,
      category:    body.category,
      status:      body.status,
      remark:      body.remark  || '',
      pics:        body.pics    || [],
      shift:       body.shift,
      submittedAt: new Date().toISOString(),
      approved:    false,
    };
    db.submissions.push(sub);
    saveDB(db);
    json(res, { ok: true, submission: sub });
  },

  // POST /api/templog — crew submits temperature readings
  'POST /api/templog': async (req, res) => {
    const body = await parseBody(req);
    const db   = loadDB();
    const log  = {
      id:          Date.now().toString(),
      storeId:     body.storeId,
      storeName:   body.storeName,
      crew:        body.crew,
      shift:       body.shift,
      readings:    body.readings,
      submittedAt: new Date().toISOString(),
    };
    db.tempLogs.push(log);
    saveDB(db);
    json(res, { ok: true });
  },

  // POST /api/notify — manager pushes a notification to a store
  'POST /api/notify': async (req, res) => {
    const body  = await parseBody(req);
    const db    = loadDB();
    const notif = {
      id:        Date.now().toString(),
      storeId:   body.storeId,
      storeName: body.storeName,
      message:   body.message,
      sentAt:    new Date().toISOString(),
      read:      false,
    };
    db.notifications.push(notif);
    saveDB(db);
    json(res, { ok: true });
  },

  // POST /api/notifications/read — mark all store notifications as read
  'POST /api/notifications/read': async (req, res) => {
    const body = await parseBody(req);
    const db   = loadDB();
    db.notifications.forEach(n => { if (n.storeId === body.storeId) n.read = true; });
    saveDB(db);
    json(res, { ok: true });
  },

  // POST /api/approve — manager approves a submission
  'POST /api/approve': async (req, res) => {
    const body = await parseBody(req);
    const db   = loadDB();
    const sub  = db.submissions.find(s => s.id === body.id);
    if (sub) {
      sub.approved   = true;
      sub.approvedAt = new Date().toISOString();
    }
    saveDB(db);
    json(res, { ok: true });
  },

  // GET /api/report — CSV export of all submissions
  'GET /api/report': async (req, res) => {
    const db   = loadDB();
    const rows = ['Store,Crew,Shift,Category,Task,Status,Remark,Photos,Approved,Submitted'];
    db.submissions.forEach(s => {
      rows.push([
        s.storeName, s.crew, s.shift, s.category,
        `"${s.taskName}"`, s.status, `"${s.remark || ''}"`,
        s.pics.length, s.approved, s.submittedAt,
      ].join(','));
    });
    res.writeHead(200, {
      'Content-Type':        'text/csv',
      'Content-Disposition': 'attachment; filename="alfamart_energy_report.csv"',
    });
    res.end(rows.join('\n'));
  },

  // POST /api/ai-ocr — server-side proxy for Anthropic vision API
  // electric-meter.js calls this instead of hitting api.anthropic.com directly
  // This fixes CORS + keeps the API key off the client (safe in APK)
  'POST /api/ai-ocr': async (req, res) => {
    const body = await parseBody(req);
    if (!body.imageBase64 || !body.mediaType) {
      return json(res, { error: 'Missing imageBase64 or mediaType' }, 400);
    }

    // ── Set your Anthropic API key here, or via environment variable ──
    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || 'YOUR_API_KEY_HERE';
    if (ANTHROPIC_KEY === 'YOUR_API_KEY_HERE') {
      return json(res, { error: 'ANTHROPIC_API_KEY not set on server. Add it to server.js or set env var.' }, 500);
    }

    try {
      const https = require('https');
      const payload = JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: body.mediaType, data: body.imageBase64 } },
            { type: 'text',  text: 'This is a photo of an electric meter. Read the kWh value shown on the meter display. Return ONLY a JSON object: {"kwh": <number>, "confidence": "high"|"medium"|"low", "note": "<brief note if needed>"}. If you cannot read the value, return {"kwh": null, "confidence": "low", "note": "Could not read meter"}. No other text.' }
          ]
        }]
      });

      const result = await new Promise((resolve, reject) => {
        const options = {
          hostname: 'api.anthropic.com',
          path:     '/v1/messages',
          method:   'POST',
          headers: {
            'Content-Type':      'application/json',
            'x-api-key':         ANTHROPIC_KEY,
            'anthropic-version': '2023-06-01',
            'Content-Length':    Buffer.byteLength(payload),
          }
        };
        const r = https.request(options, resp => {
          let data = '';
          resp.on('data', chunk => data += chunk);
          resp.on('end', () => {
            try { resolve({ status: resp.statusCode, body: JSON.parse(data) }); }
            catch(e) { reject(new Error('Bad JSON from Anthropic')); }
          });
        });
        r.on('error', reject);
        r.write(payload);
        r.end();
      });

      json(res, result.body, result.status);
    } catch (err) {
      console.error('[AI-OCR]', err.message);
      json(res, { error: err.message }, 502);
    }
  },

  // DELETE /api/reset — clear all submissions (dev/testing only)
  'DELETE /api/reset': async (req, res) => {
    const db = loadDB();
    db.submissions    = [];
    db.tempLogs       = [];
    db.notifications  = [];
    saveDB(db);
    json(res, { ok: true });
  },

  // GET /api/compliance — compliance logs
  'GET /api/compliance': async (req, res) => {
    const db = loadDB();
    json(res, { logs: db.complianceLogs || {} });
  },

  // POST /api/compliance/complete — mark store's pending compliance as done
  'POST /api/compliance/complete': async (req, res) => {
    const body = await parseBody(req);
    const db   = loadDB();
    if (!db.complianceLogs) db.complianceLogs = {};
    const today = new Date().toDateString();
    Object.keys(db.complianceLogs).forEach(k => {
      const log = db.complianceLogs[k];
      if (log.storeId === body.storeId && k.includes(today) && log.completedAt === null) {
        const firedAt    = new Date(log.firedAt);
        const now        = new Date();
        const minutesLate = Math.round((now - firedAt) / 60000);
        log.completedAt   = now.toISOString();
        log.minutesLate   = minutesLate;
        log.compliancePct = getComplianceRate(minutesLate);
      }
    });
    saveDB(db);
    json(res, { ok: true });
  },
};

// ═══════════════════════════════════════════════════════════
// HTTP SERVER
// ═══════════════════════════════════════════════════════════

const server = http.createServer(async (req, res) => {
  const parsed   = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // ── Preflight ──
  if (req.method === 'OPTIONS') { json(res, {}); return; }

  // ── SECRET PATH CHECK ───────────────────────────────────
  // All real traffic must start with /<SITE_KEY>
  // Anyone hitting / or any other path gets a plain 404 — no hint the app exists.
  const PREFIX     = `/${SITE_KEY}`;
  const API_PREFIX = `/${SITE_KEY}/api/`;

  if (!pathname.startsWith(PREFIX)) {
    res.writeHead(404); res.end('Not found'); return;
  }

  // Strip the prefix to get the real path
  const innerPath = pathname.slice(PREFIX.length) || '/';

  // ── API ROUTING ─────────────────────────────────────────
  if (innerPath.startsWith('/api/')) {
    // Token check — login endpoint is exempt (it IS the auth)
    if (innerPath !== '/api/login') {
      const token = req.headers['x-app-token'];
      if (token !== APP_TOKEN) {
        console.warn(`[SECURITY] Invalid token from ${req.socket.remoteAddress} on ${innerPath}`);
        return json(res, { error: 'Unauthorized' }, 401);
      }
    }

    const routeKey = `${req.method} ${innerPath}`;
    const handler  = API_ROUTES[routeKey];
    if (handler) {
      try {
        await handler(req, res);
      } catch (err) {
        console.error('[API Error]', routeKey, err.message);
        json(res, { error: 'Internal server error' }, 500);
      }
    } else {
      notFound(res);
    }
    return;
  }

  // ── STATIC FILE SERVING ─────────────────────────────────
  let filePath = innerPath === '/' ? '/index.html' : innerPath;
  filePath = path.join(PUBLIC_PATH, filePath);

  // Security: prevent path traversal
  if (!filePath.startsWith(PUBLIC_PATH)) {
    res.writeHead(403); res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback — serve index.html for unknown paths inside the prefix
      fs.readFile(path.join(PUBLIC_PATH, 'index.html'), (e2, d2) => {
        if (e2) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(d2);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
});

// ═══════════════════════════════════════════════════════════
// SCHEDULED NOTIFICATIONS + COMPLIANCE TRACKING
// ═══════════════════════════════════════════════════════════

const SCHEDULES = [
  {
    hour: 7,  min: 0,
    label: '7AM OPEN CHECK',
    graceMins: 90,
    msg: '🌅 7AM Opening Checklist: Complete AC, Lighting, and opening tasks. Attach photos. ⏱ Grace period: 20 mins (100%) → 90 mins (0%).',
  },
  {
    hour: 17, min: 40,
    label: '5:40PM LIGHTS ON',
    graceMins: 90,
    msg: '💡 5:40PM: Turn ON Flood Light, Façade, Pylon & Canopy. ⏱ Grace: 20 mins (100%) → 90 mins (0%).',
  },
  {
    hour: 0,  min: 0,
    label: '12MN SHUTDOWN',
    graceMins: 90,
    msg: '🔴 12MN: Unplug all RTE equipment. Turn OFF Selling Area lights. ⏱ Grace: 20 mins (100%) → 90 mins (0%).',
  },
];

/** Tracks which schedules have already fired today */
const lastFired = {};

function scheduleChecklist() {
  setInterval(() => {
    const now   = new Date();
    const h     = now.getHours();
    const m     = now.getMinutes();
    const today = now.toDateString();

    SCHEDULES.forEach(sch => {
      const key   = `${sch.hour}:${sch.min}`;
      const schMs = new Date(`${today} ${String(sch.hour).padStart(2,'0')}:${String(sch.min).padStart(2,'0')}:00`).getTime();

      // ── FIRE at exact scheduled time ──
      if (h === sch.hour && m === sch.min && lastFired[key] !== today) {
        lastFired[key] = today;
        const db = loadDB();
        if (!db.complianceLogs) db.complianceLogs = {};

        (db.stores || []).forEach(st => {
          // Push notification
          db.notifications.push({
            id:          `${Date.now()}_${st.id}`,
            storeId:     st.id,
            storeName:   st.name,
            message:     `[${sch.label}] ${sch.msg}`,
            sentAt:      now.toISOString(),
            read:        false,
            scheduled:   true,
            scheduleKey: key,
            graceMins:   sch.graceMins,
          });
          // Init compliance tracking entry
          const cKey = `${st.id}_${today}_${key}`;
          db.complianceLogs[cKey] = {
            storeId:      st.id,
            storeName:    st.name,
            schedule:     sch.label,
            firedAt:      now.toISOString(),
            completedAt:  null,
            minutesLate:  null,
            compliancePct: null,
          };
        });
        saveDB(db);
        console.log(`[SCHEDULED] ${sch.label} — notified all ${(db.stores||[]).length} stores`);
      }

      // ── GRACE PERIOD: update pending compliance scores every minute ──
      const minutesPast = (now.getTime() - schMs) / 60000;
      if (minutesPast > 0 && minutesPast <= (sch.graceMins + 5) && lastFired[key] === today) {
        const db = loadDB();
        if (!db.complianceLogs) db.complianceLogs = {};
        let changed = false;
        (db.stores || []).forEach(st => {
          const cKey = `${st.id}_${today}_${key}`;
          const log  = db.complianceLogs[cKey];
          if (log && log.completedAt === null) {
            const pct = getComplianceRate(minutesPast);
            if (log.compliancePct !== pct) {
              log.compliancePct = pct;
              log.minutesLate   = Math.round(minutesPast);
              changed = true;
            }
          }
        });
        if (changed) saveDB(db);
      }
    });
  }, 60_000); // tick every 60 seconds
}

scheduleChecklist();

// ═══════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════

server.listen(PORT, '0.0.0.0', () => {
  // Detect local network IP
  let localIP = 'localhost';
  Object.values(os.networkInterfaces()).forEach(list => {
    list.forEach(i => { if (i.family === 'IPv4' && !i.internal) localIP = i.address; });
  });

  const ALIAS    = 'alfacheck';          // ← friendly hostname (must match hosts file)
  const APP_PATH = `/${SITE_KEY}/`;

  const line = '══════════════════════════════════════════════════';
  console.log(`\n╔${line}╗`);
  console.log( '║   ALFAMART ENERGY CHECKLIST  ·  SECURE MODE       ║');
  console.log(`╠${line}╣`);
  console.log(`║  Manager   http://localhost:${PORT}${APP_PATH}`.padEnd(52) + '║');
  console.log(`║  Crew      http://${ALIAS}:${PORT}${APP_PATH}`.padEnd(52) + '║');
  console.log( '║                                                    ║');
  console.log(`║  Raw IP    http://${localIP}:${PORT}${APP_PATH}`.padEnd(52) + '║');
  console.log( '║  (raw IP works too — alias is just friendlier)     ║');
  console.log( '║                                                    ║');
  console.log( '║  ⚠  Accessing without /${SITE_KEY}/ returns 404    ║');
  console.log( '║  ⚠  API calls require X-App-Token header           ║');
  console.log( '║  ⚠  Login blocked after 5 bad PINs / 15 min       ║');
  console.log(`╚${line}╝\n`);

  console.log(`  SITE_KEY  : ${SITE_KEY}   (change in server.js → SITE_KEY)`);
  console.log(`  APP_TOKEN : ${APP_TOKEN}  (change in server.js → APP_TOKEN + index.html)`);
  console.log(`  Alias     : ${ALIAS}      (add to C:\\Windows\\System32\\drivers\\etc\\hosts)\n`);
});
