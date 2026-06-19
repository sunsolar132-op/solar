const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../db');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { google } = require('googleapis');

// ─── OAuth2 client (credentials from .env) ───────────────────────────────────
function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/admin/backup/google-callback'
  );
}

// In-memory state store: stateToken -> { adminId }
// Expires automatically after 5 minutes via cleanup
const pendingStates = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of pendingStates.entries()) {
    if (now - val.createdAt > 5 * 60 * 1000) pendingStates.delete(key);
  }
}, 60 * 1000);

// ─── Tables to backup/restore ─────────────────────────────────────────────────
const BACKUP_TABLES = [
  'admins', 'parties', 'units', 'products', 'firms', 'agents',
  'transactions', 'bill_items', 'party_firm_access', 'party_agent_access',
  'outward_details', 'firm_product_opening_stock', 'entry_edit_logs',
];

const BACKUP_DIR = path.join(__dirname, '../../WMS_Backups');
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ─── Core backup logic ────────────────────────────────────────────────────────
async function performBackup(type = 'MANUAL') {
  const tableData = {};
  for (const table of BACKUP_TABLES) {
    try {
      const res = await db.query(`SELECT * FROM ${table}`);
      tableData[table] = res.rows;
    } catch { tableData[table] = []; }
  }

  const payload = { version: '1.0', createdAt: new Date().toISOString(), tables: tableData };
  const jsonStr = JSON.stringify(payload, null, 2);
  const sizeBytes = Buffer.byteLength(jsonStr, 'utf8');

  const filename = `WMS_Backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  fs.writeFileSync(path.join(BACKUP_DIR, filename), jsonStr, 'utf8');

  const driveLink = `/WMS_Backups/${filename}`;
  const id = crypto.randomUUID();

  await db.query(
    `INSERT INTO backup_history (id, created_at, type, size_bytes, status, drive_link, backup_data)
     VALUES ($1, NOW(), $2, $3, 'SUCCESS', $4, $5)`,
    [id, type, sizeBytes, driveLink, JSON.stringify(payload)]
  );
  await db.query(`UPDATE backup_settings SET last_backup_at = NOW(), updated_at = NOW() WHERE id = 'singleton'`);

  return { id, sizeBytes, driveLink, filename, payload };
}

// ─── GET /settings ────────────────────────────────────────────────────────────
router.get('/settings', auth(['ADMIN']), async (req, res) => {
  try {
    const result = await db.query(`SELECT * FROM backup_settings WHERE id = 'singleton'`);
    const row = result.rows[0];
    res.json({
      googleEmail: row.google_email || null,
      isVerified: row.is_verified,
      autoBackupEnabled: row.auto_backup_enabled,
      frequency: row.frequency,
      dailyTime: row.daily_time,
      lastBackupAt: row.last_backup_at || null,
      googleConfigured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /google-auth-url  (auth-protected — generates OAuth URL) ─────────────
router.get('/google-auth-url', auth(['ADMIN']), (req, res) => {
  try {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.status(400).json({ error: 'Google OAuth not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to server/.env' });
    }
    const state = crypto.randomUUID();
    pendingStates.set(state, { adminId: req.user.id, createdAt: Date.now() });

    const oauth2Client = getOAuth2Client();
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile'],
      state,
      prompt: 'select_account',
    });
    res.json({ url });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /google-callback  (Google redirects here after auth) ─────────────────
// NOTE: No auth middleware — this is hit by Google's redirect, not by the client directly
router.get('/google-callback', async (req, res) => {
  const { code, state, error } = req.query;

  // HTML helper to send a postMessage to the opener popup and close
  const sendToPopup = (type, payload = {}) => res.send(`
    <!DOCTYPE html><html><body>
    <script>
      try {
        window.opener.postMessage(${JSON.stringify({ type, ...payload })}, '*');
      } catch(e) {}
      window.close();
    </script>
    <p style="font-family:sans-serif;padding:32px;color:#64748b;">
      ${type === 'GOOGLE_AUTH_SUCCESS' ? '✅ Verified! You can close this window.' : '❌ Auth failed. You can close this window.'}
    </p>
    </body></html>
  `);

  if (error) return sendToPopup('GOOGLE_AUTH_ERROR', { reason: error });
  if (!state || !pendingStates.has(state)) return sendToPopup('GOOGLE_AUTH_ERROR', { reason: 'Invalid or expired state' });

  const { adminId } = pendingStates.get(state);
  pendingStates.delete(state);

  try {
    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user email from Google
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data } = await oauth2.userinfo.get();
    const email = data.email;

    // Save email as verified
    await db.query(
      `UPDATE backup_settings SET google_email = $1, is_verified = true, verification_code = NULL, updated_at = NOW() WHERE id = 'singleton'`,
      [email]
    );

    sendToPopup('GOOGLE_AUTH_SUCCESS', { email });
  } catch (err) {
    console.error('[Backup] Google OAuth error:', err.message);
    sendToPopup('GOOGLE_AUTH_ERROR', { reason: err.message });
  }
});

// ─── POST /disconnect-google ──────────────────────────────────────────────────
router.post('/disconnect-google', auth(['ADMIN']), async (req, res) => {
  try {
    await db.query(`UPDATE backup_settings SET google_email = NULL, is_verified = false, updated_at = NOW() WHERE id = 'singleton'`);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── POST /settings ───────────────────────────────────────────────────────────
router.post('/settings', auth(['ADMIN']), async (req, res) => {
  try {
    const { autoBackupEnabled, frequency, dailyTime } = req.body;
    const validFreqs = ['DAILY', 'FIRST_OPEN', 'BOTH'];
    const freq = validFreqs.includes(frequency) ? frequency : 'DAILY';
    await db.query(
      `UPDATE backup_settings SET auto_backup_enabled = $1, frequency = $2, daily_time = $3, updated_at = NOW() WHERE id = 'singleton'`,
      [!!autoBackupEnabled, freq, dailyTime || '23:00']
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── POST /run  (Manual Backup) ───────────────────────────────────────────────
router.post('/run', auth(['ADMIN']), async (req, res) => {
  try {
    const result = await performBackup('MANUAL');
    res.json({ ok: true, id: result.id, filename: result.filename, sizeBytes: result.sizeBytes, driveLink: result.driveLink, data: result.payload });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── POST /check-first-open ───────────────────────────────────────────────────
router.post('/check-first-open', auth(['ADMIN']), async (req, res) => {
  try {
    const result = await db.query(`SELECT * FROM backup_settings WHERE id = 'singleton'`);
    const row = result.rows[0];
    if (!row.auto_backup_enabled) return res.json({ triggered: false, reason: 'auto_disabled' });
    if (!['FIRST_OPEN', 'BOTH'].includes(row.frequency)) return res.json({ triggered: false, reason: 'frequency_not_applicable' });

    const lastAt = row.last_backup_at ? new Date(row.last_backup_at) : null;
    const today = new Date();
    const isSameDay = lastAt &&
      lastAt.getFullYear() === today.getFullYear() &&
      lastAt.getMonth() === today.getMonth() &&
      lastAt.getDate() === today.getDate();
    if (isSameDay) return res.json({ triggered: false, reason: 'already_backed_up_today' });

    await performBackup('AUTO');
    res.json({ triggered: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /history ─────────────────────────────────────────────────────────────
router.get('/history', auth(['ADMIN']), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, created_at, type, size_bytes, status, drive_link FROM backup_history ORDER BY created_at DESC LIMIT 50`
    );
    res.json(result.rows.map(r => ({
      id: r.id, createdAt: r.created_at, type: r.type,
      sizeBytes: r.size_bytes, sizeLabel: formatBytes(r.size_bytes),
      status: r.status, driveLink: r.drive_link,
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /download/:id ────────────────────────────────────────────────────────
router.get('/download/:id', auth(['ADMIN']), async (req, res) => {
  try {
    const result = await db.query(`SELECT backup_data, created_at, type FROM backup_history WHERE id = $1`, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Backup not found' });
    const row = result.rows[0];
    const filename = `WMS_Backup_${new Date(row.created_at).toISOString().replace(/[:.]/g, '-')}_${row.type}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(row.backup_data, null, 2));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── POST /restore ────────────────────────────────────────────────────────────
router.post('/restore', auth(['ADMIN']), async (req, res) => {
  try {
    const { data } = req.body;
    if (!data || !data.tables) return res.status(400).json({ error: 'Invalid backup data' });

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET session_replication_role = replica');
      for (const table of [...BACKUP_TABLES].reverse()) {
        await client.query(`TRUNCATE TABLE ${table} CASCADE`);
      }
      for (const table of BACKUP_TABLES) {
        const rows = data.tables[table];
        if (!rows || !rows.length) continue;
        const cols = Object.keys(rows[0]);
        const colList = cols.map(c => `"${c}"`).join(', ');
        for (const row of rows) {
          const vals = cols.map(c => row[c]);
          const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
          await client.query(`INSERT INTO ${table} (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`, vals);
        }
      }
      await client.query('SET session_replication_role = DEFAULT');
      await client.query('COMMIT');
      res.json({ ok: true });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally { client.release(); }
  } catch (err) {
    console.error('[Backup] Restore error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Daily schedule (called from server.js every 60s) ────────────────────────
async function runDailySchedule() {
  try {
    const result = await db.query(`SELECT * FROM backup_settings WHERE id = 'singleton'`);
    const row = result.rows[0];
    if (!row.auto_backup_enabled) return;
    if (!['DAILY', 'BOTH'].includes(row.frequency)) return;

    const [scheduledHour, scheduledMin] = (row.daily_time || '23:00').split(':').map(Number);
    const now = new Date();
    if (now.getHours() !== scheduledHour || now.getMinutes() !== scheduledMin) return;

    const lastAt = row.last_backup_at ? new Date(row.last_backup_at) : null;
    if (lastAt && Date.now() - lastAt.getTime() < 2 * 60 * 1000) return;

    console.log('[Backup] Running scheduled daily auto-backup...');
    await performBackup('AUTO');
    console.log('[Backup] Scheduled auto-backup complete.');
  } catch (err) { console.error('[Backup] Scheduled backup error:', err.message); }
}

module.exports = router;
module.exports.runDailySchedule = runDailySchedule;
