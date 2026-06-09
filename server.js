/**
 * server.js — Alfamart Energy Checklist
 * Node.js HTTP server · REST API · SQLite storage
 *
 * SETUP (first time):
 *   npm install better-sqlite3
 *   node server.js
 *
 * The database file is created automatically at  data/alfamart.db
 * Drop alfamart_db.sql into the same  data/  folder — server runs it
 * automatically on first launch to create tables and seed default data.
 */

'use strict';

const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const url    = require('url');
const os     = require('os');

// ── CONSTANTS ─────────────────────────────────────────────
const PORT        = process.env.PORT || 3000;
const DATA_DIR    = path.join(__dirname, 'data');
const DB_FILE     = path.join(DATA_DIR, 'alfamart.db');
const SQL_SEED    = path.join(DATA_DIR, 'alfamart_db.sql');
const PUBLIC_PATH = path.join(__dirname, 'public');

// ── SECURITY ───────────────────────────────────────────────
const SITE_KEY  = 'atp';
const APP_TOKEN = 'alfamart-2026';

// ── RATE LIMITER — login endpoint only ────────────────────
const loginAttempts  = {};
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_MS  = 15 * 60 * 1000;

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

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,X-App-Token',
};

// ═══════════════════════════════════════════════════════════
// DATABASE — SQLite via better-sqlite3
// ═══════════════════════════════════════════════════════════

let Database;
try {
  Database = require('better-sqlite3');
} catch (e) {
  console.error('\n[FATAL] better-sqlite3 not installed.');
  console.error('  Run:  npm install better-sqlite3\n');
  process.exit(1);
}

// Ensure data/ directory exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_FILE);

// Enable WAL mode for safe concurrent reads + better write performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Auto-run SQL seed file on first launch ─────────────────
// If alfamart_db.sql exists and the stores table is empty, run the seed.
function runSeedIfNeeded() {
  if (!fs.existsSync(SQL_SEED)) {
    console.warn('[DB] Seed file not found at', SQL_SEED, '— skipping seed.');
    return;
  }
  try {
    // Run the entire SQL file as one batch (creates tables + inserts)
    const sql = fs.readFileSync(SQL_SEED, 'utf8');
    db.exec(sql);
    console.log('[DB] Schema + seed applied from alfamart_db.sql');
  } catch (e) {
    console.error('[DB] Seed error:', e.message);
  }
}
runSeedIfNeeded();

// ── Prepared statements ─────────────────────────────────────
const stmts = {
  // stores
  allStores:   db.prepare('SELECT id, name, store_no AS storeNo, short, store_status AS storeStatus FROM stores'),
  // users
  userByPin:   db.prepare('SELECT id, name, role, pin, store_id AS storeId FROM users WHERE pin = ?'),
  allUsers:    db.prepare('SELECT id, name, role, pin, store_id AS storeId FROM users'),
  // submissions
  allSubs:     db.prepare('SELECT id, store_id AS storeId, store_name AS storeName, crew, crew_id AS crewId, task_id AS taskId, task_name AS taskName, category, status, remark, pics, shift, submitted_at AS submittedAt, approved, approved_at AS approvedAt FROM submissions ORDER BY submitted_at DESC'),
  insertSub:   db.prepare('INSERT INTO submissions (id,store_id,store_name,crew,crew_id,task_id,task_name,category,status,remark,pics,shift,submitted_at,approved) VALUES (@id,@storeId,@storeName,@crew,@crewId,@taskId,@taskName,@category,@status,@remark,@pics,@shift,@submittedAt,0)'),
  approveSub:  db.prepare('UPDATE submissions SET approved=1, approved_at=? WHERE id=?'),
  deleteSubs:  db.prepare('DELETE FROM submissions'),
  // temp logs
  allTempLogs: db.prepare('SELECT id, store_id AS storeId, store_name AS storeName, crew, shift, readings, submitted_at AS submittedAt FROM temp_logs ORDER BY submitted_at DESC'),
  insertTemp:  db.prepare('INSERT INTO temp_logs (id,store_id,store_name,crew,shift,readings,submitted_at) VALUES (@id,@storeId,@storeName,@crew,@shift,@readings,@submittedAt)'),
  deleteLogs:  db.prepare('DELETE FROM temp_logs'),
  // notifications
  allNotifs:   db.prepare('SELECT id, store_id AS storeId, store_name AS storeName, message, sent_at AS sentAt, read, scheduled, schedule_key AS scheduleKey, grace_mins AS graceMins FROM notifications ORDER BY sent_at DESC'),
  insertNotif: db.prepare('INSERT INTO notifications (id,store_id,store_name,message,sent_at,read,scheduled,schedule_key,grace_mins) VALUES (@id,@storeId,@storeName,@message,@sentAt,0,@scheduled,@scheduleKey,@graceMins)'),
  markRead:    db.prepare('UPDATE notifications SET read=1 WHERE store_id=?'),
  deleteNotifs:db.prepare('DELETE FROM notifications'),
  // compliance
  allCompliance:   db.prepare('SELECT key, store_id AS storeId, store_name AS storeName, schedule, fired_at AS firedAt, completed_at AS completedAt, minutes_late AS minutesLate, compliance_pct AS compliancePct FROM compliance_logs'),
  insertCompliance:db.prepare('INSERT OR IGNORE INTO compliance_logs (key,store_id,store_name,schedule,fired_at,completed_at,minutes_late,compliance_pct) VALUES (@key,@storeId,@storeName,@schedule,@firedAt,NULL,NULL,NULL)'),
  updateCompliance:db.prepare('UPDATE compliance_logs SET completed_at=@completedAt, minutes_late=@minutesLate, compliance_pct=@compliancePct WHERE key=@key'),
  updateCompliancePct: db.prepare('UPDATE compliance_logs SET compliance_pct=@pct, minutes_late=@mins WHERE key=@key AND completed_at IS NULL'),
};

// ── Helper: build the full db snapshot the client expects ──
function getSnapshot() {
  const stores      = stmts.allStores.all();
  const users       = stmts.allUsers.all();
  const submissions = stmts.allSubs.all().map(s => ({
    ...s,
    pics:     JSON.parse(s.pics || '[]'),
    approved: !!s.approved,
  }));
  const tempLogs = stmts.allTempLogs.all().map(t => ({
    ...t,
    readings: JSON.parse(t.readings || '{}'),
  }));
  const notifications = stmts.allNotifs.all().map(n => ({
    ...n,
    read:      !!n.read,
    scheduled: !!n.scheduled,
  }));
  // Compliance: server returns as object keyed by log key (legacy format)
  const complianceLogs = {};
  stmts.allCompliance.all().forEach(c => { complianceLogs[c.key] = c; });

  return { stores, users, submissions, tempLogs, notifications, complianceLogs };
}

// ═══════════════════════════════════════════════════════════
// REQUEST HELPERS
// ═══════════════════════════════════════════════════════════

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 20e6) { req.destroy(); reject(new Error('Body too large')); }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch (e) { resolve({}); }
    });
    req.on('error', reject);
  });
}

function json(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type':   'application/json',
    'Content-Length': Buffer.byteLength(body),
    ...CORS_HEADERS,
  });
  res.end(body);
}

function notFound(res) { json(res, { error: 'Not found' }, 404); }

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
    json(res, getSnapshot());
  },

  // POST /api/login — PIN authentication (rate-limited)
  'POST /api/login': async (req, res) => {
    const ip = req.socket.remoteAddress || 'unknown';
    if (isRateLimited(ip)) {
      return json(res, { error: 'Too many attempts. Try again in 15 minutes.' }, 429);
    }
    const body = await parseBody(req);
    const user = stmts.userByPin.get(body.pin);
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
    const sub = {
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
      pics:        JSON.stringify(body.pics || []),
      shift:       body.shift,
      submittedAt: new Date().toISOString(),
    };
    stmts.insertSub.run(sub);
    // Return the same shape the client expects
    const returned = { ...sub, pics: body.pics || [], approved: false };
    json(res, { ok: true, submission: returned });
  },

  // POST /api/templog — crew submits temperature readings
  'POST /api/templog': async (req, res) => {
    const body = await parseBody(req);
    const log = {
      id:          Date.now().toString(),
      storeId:     body.storeId,
      storeName:   body.storeName,
      crew:        body.crew,
      shift:       body.shift,
      readings:    JSON.stringify(body.readings || {}),
      submittedAt: new Date().toISOString(),
    };
    stmts.insertTemp.run(log);
    json(res, { ok: true });
  },

  // POST /api/notify — manager pushes a notification to a store
  'POST /api/notify': async (req, res) => {
    const body = await parseBody(req);
    stmts.insertNotif.run({
      id:          Date.now().toString(),
      storeId:     body.storeId,
      storeName:   body.storeName,
      message:     body.message,
      sentAt:      new Date().toISOString(),
      scheduled:   0,
      scheduleKey: null,
      graceMins:   null,
    });
    json(res, { ok: true });
  },

  // POST /api/notifications/read — mark all store notifications as read
  'POST /api/notifications/read': async (req, res) => {
    const body = await parseBody(req);
    stmts.markRead.run(body.storeId);
    json(res, { ok: true });
  },

  // POST /api/approve — manager approves a submission
  'POST /api/approve': async (req, res) => {
    const body = await parseBody(req);
    stmts.approveSub.run(new Date().toISOString(), body.id);
    json(res, { ok: true });
  },

  // GET /api/report — CSV export of all submissions
  'GET /api/report': async (req, res) => {
    const submissions = stmts.allSubs.all().map(s => ({
      ...s,
      pics:     JSON.parse(s.pics || '[]'),
      approved: !!s.approved,
    }));
    const rows = ['Store,Crew,Shift,Category,Task,Status,Remark,Photos,Approved,Submitted'];
    submissions.forEach(s => {
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
  'POST /api/ai-ocr': async (req, res) => {
    const body = await parseBody(req);
    if (!body.imageBase64 || !body.mediaType) {
      return json(res, { error: 'Missing imageBase64 or mediaType' }, 400);
    }
    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || 'YOUR_API_KEY_HERE';
    if (ANTHROPIC_KEY === 'YOUR_API_KEY_HERE') {
      return json(res, { error: 'ANTHROPIC_API_KEY not set on server.' }, 500);
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

  // DELETE /api/reset — clear all transactional data (dev/testing only)
  'DELETE /api/reset': async (req, res) => {
    db.transaction(() => {
      stmts.deleteSubs.run();
      stmts.deleteLogs.run();
      stmts.deleteNotifs.run();
      db.prepare('DELETE FROM compliance_logs').run();
    })();
    json(res, { ok: true });
  },

  // GET /api/compliance — compliance logs
  'GET /api/compliance': async (req, res) => {
    const logs = {};
    stmts.allCompliance.all().forEach(c => { logs[c.key] = c; });
    json(res, { logs });
  },

  // POST /api/compliance/complete — mark store's pending compliance as done
  'POST /api/compliance/complete': async (req, res) => {
    const body  = await parseBody(req);
    const today = new Date().toDateString();
    const rows  = stmts.allCompliance.all().filter(c =>
      c.storeId === body.storeId &&
      c.key.includes(today) &&
      c.completedAt === null
    );
    const now = new Date();
    rows.forEach(log => {
      const minutesLate  = Math.round((now - new Date(log.firedAt)) / 60000);
      stmts.updateCompliance.run({
        completedAt:   now.toISOString(),
        minutesLate,
        compliancePct: getComplianceRate(minutesLate),
        key:           log.key,
      });
    });
    json(res, { ok: true });
  },
};

// ═══════════════════════════════════════════════════════════
// HTTP SERVER
// ═══════════════════════════════════════════════════════════

const server = http.createServer(async (req, res) => {
  const parsed   = url.parse(req.url, true);
  const pathname = parsed.pathname;

  if (req.method === 'OPTIONS') { json(res, {}); return; }

  const PREFIX = `/${SITE_KEY}`;
  if (!pathname.startsWith(PREFIX)) {
    res.writeHead(404); res.end('Not found'); return;
  }

  const innerPath = pathname.slice(PREFIX.length) || '/';

  if (innerPath.startsWith('/api/')) {
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

  // Static file serving
  let filePath = innerPath === '/' ? '/index.html' : innerPath;
  filePath = path.join(PUBLIC_PATH, filePath);
  if (!filePath.startsWith(PUBLIC_PATH)) { res.writeHead(403); res.end('Forbidden'); return; }

  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
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
  { hour: 7,  min: 0,  label: '7AM OPEN CHECK',   graceMins: 90, msg: '🌅 7AM Opening Checklist: Complete AC, Lighting, and opening tasks. Attach photos. ⏱ Grace period: 20 mins (100%) → 90 mins (0%).' },
  { hour: 17, min: 40, label: '5:40PM LIGHTS ON',  graceMins: 90, msg: '💡 5:40PM: Turn ON Flood Light, Façade, Pylon & Canopy. ⏱ Grace: 20 mins (100%) → 90 mins (0%).' },
  { hour: 0,  min: 0,  label: '12MN SHUTDOWN',     graceMins: 90, msg: '🔴 12MN: Unplug all RTE equipment. Turn OFF Selling Area lights. ⏱ Grace: 20 mins (100%) → 90 mins (0%).' },
];

const lastFired = {};

// Returns the current moment expressed in Philippine Time (UTC+8).
// Using Intl.DateTimeFormat avoids any DST ambiguity and works regardless
// of the server's own timezone setting.
function nowPHT() {
  const utcMs  = Date.now();
  const PHT_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8, no DST in PH
  return new Date(utcMs + PHT_OFFSET_MS);
}

// 'YYYY-MM-DD' string in PHT, used as the dedup key for lastFired.
function todayPHT(phtDate) {
  const d = phtDate || nowPHT();
  return d.getUTCFullYear() + '-' +
    String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
    String(d.getUTCDate()).padStart(2, '0');
}

function scheduleChecklist() {
  setInterval(() => {
    const now   = nowPHT();           // ← PHT clock, not server UTC
    const h     = now.getUTCHours();  // getUTCHours() on the shifted date = PHT hour
    const m     = now.getUTCMinutes();
    const today = todayPHT(now);      // 'YYYY-MM-DD' in PHT

    const realNow = new Date(); // true UTC wall-clock for ISO timestamps

    SCHEDULES.forEach(sch => {
      const key   = `${sch.hour}:${sch.min}`;
      // schMs = the scheduled time expressed as real UTC milliseconds
      // e.g. 12MN PHT = 16:00 UTC same day
      const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;
      const schMs = Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
        sch.hour, sch.min, 0
      ) - PHT_OFFSET_MS;

      // FIRE at exact scheduled time
      if (h === sch.hour && m === sch.min && lastFired[key] !== today) {
        lastFired[key] = today;

        const stores = stmts.allStores.all();
        const insertManyNotifs = db.transaction((storeList) => {
          storeList.forEach(st => {
            stmts.insertNotif.run({
              id:          `${Date.now()}_${st.id}`,
              storeId:     st.id,
              storeName:   st.name,
              message:     `[${sch.label}] ${sch.msg}`,
              sentAt:      realNow.toISOString(),  // real UTC ISO string
              scheduled:   1,
              scheduleKey: key,
              graceMins:   sch.graceMins,
            });
            stmts.insertCompliance.run({
              key:       `${st.id}_${today}_${key}`,
              storeId:   st.id,
              storeName: st.name,
              schedule:  sch.label,
              firedAt:   realNow.toISOString(),    // real UTC ISO string
            });
          });
        });
        insertManyNotifs(stores);
        console.log(`[SCHEDULED] ${sch.label} — notified all ${stores.length} stores`);
      }

      // GRACE PERIOD: update pending compliance scores every minute
      const minutesPast = (now.getTime() - schMs) / 60000;
      if (minutesPast > 0 && minutesPast <= (sch.graceMins + 5) && lastFired[key] === today) {
        const pct = getComplianceRate(minutesPast);
        db.prepare(`
          UPDATE compliance_logs
             SET compliance_pct = ?, minutes_late = ?
           WHERE key LIKE ? AND completed_at IS NULL
        `).run(pct, Math.round(minutesPast), `%_${today}_${key}`);
      }
    });
  }, 60_000);
}

scheduleChecklist();

// ═══════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════

server.listen(PORT, '0.0.0.0', () => {
  let localIP = 'localhost';
  Object.values(os.networkInterfaces()).forEach(list => {
    list.forEach(i => { if (i.family === 'IPv4' && !i.internal) localIP = i.address; });
  });

  const ALIAS    = 'alfacheck';
  const APP_PATH = `/${SITE_KEY}/`;
  const line     = '══════════════════════════════════════════════════';

  console.log(`\n╔${line}╗`);
  console.log( '║   ALFAMART ENERGY CHECKLIST  ·  SQLite Mode        ║');
  console.log(`╠${line}╣`);
  console.log(`║  Manager   http://localhost:${PORT}${APP_PATH}`.padEnd(52) + '║');
  console.log(`║  Crew      http://${ALIAS}:${PORT}${APP_PATH}`.padEnd(52) + '║');
  console.log(`║  Raw IP    http://${localIP}:${PORT}${APP_PATH}`.padEnd(52) + '║');
  console.log( '║                                                    ║');
  console.log(`║  Database  ${DB_FILE}`.padEnd(52) + '║');
  console.log(`╚${line}╝\n`);

  console.log(`  SITE_KEY  : ${SITE_KEY}`);
  console.log(`  APP_TOKEN : ${APP_TOKEN}`);
  console.log(`  Alias     : ${ALIAS}  (add to hosts file)\n`);
});
