const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');
const { mapFirm, mapAgent, mapAdmin } = require('./mappers');

const app = express();

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    // Allow localhost dev servers (any port, e.g. 5173, 5174, etc.)
    if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return callback(null, true);
    // Allow any device on the local network (192.168.x.x or 10.x.x.x or 172.x.x.x)
    if (/^http:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)[\d.]+:\d+$/.test(origin)) return callback(null, true);
    callback(new Error(`CORS blocked: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey123';

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check admins table first
    const adminResult = await db.query('SELECT * FROM admins WHERE email = $1 LIMIT 1', [normalizedEmail]);
    if (adminResult.rows.length) {
      const admin = mapAdmin(adminResult.rows[0]);
      const isMatch = await bcrypt.compare(password, admin.password);
      if (isMatch) {
        const token = jwt.sign(
          { id: admin.id, role: admin.role, name: admin.name },
          JWT_SECRET,
          { expiresIn: '8h' }
        );
        return res.json({
          token,
          user: { id: admin.id, email: admin.email, role: admin.role, name: admin.name },
        });
      }
    }

    const firmResult = await db.query('SELECT * FROM firms WHERE email = $1 LIMIT 1', [normalizedEmail]);
    if (firmResult.rows.length) {
      const firm = mapFirm(firmResult.rows[0]);
      const isMatch = await bcrypt.compare(password, firm.password);
      if (isMatch) {
        const token = jwt.sign(
          { id: firm.id, role: firm.role, name: firm.name },
          JWT_SECRET,
          { expiresIn: '8h' }
        );
        return res.json({
          token,
          user: { id: firm.id, email: firm.email, role: firm.role, name: firm.name },
        });
      }
    }

    const agentResult = await db.query('SELECT * FROM agents WHERE email = $1 LIMIT 1', [normalizedEmail]);
    if (agentResult.rows.length) {
      const agent = mapAgent(agentResult.rows[0]);
      const isMatch = await bcrypt.compare(password, agent.password);
      if (isMatch) {
        const token = jwt.sign(
          { id: agent.id, role: agent.role, name: agent.name, firmId: agent.firmId },
          JWT_SECRET,
          { expiresIn: '8h' }
        );
        return res.json({
          token,
          user: { id: agent.id, email: agent.email, role: agent.role, name: agent.name, firmId: agent.firmId },
        });
      }
    }

    return res.status(401).json({ error: 'Invalid credentials' });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.use('/api/admin', require('./routes/admin'));
const backupRouter = require('./routes/backup');
app.use('/api/admin/backup', backupRouter);
app.use('/api/firm', require('./routes/firm'));
app.use('/api/agent', require('./routes/agent'));
app.use('/api/products', require('./routes/products'));
app.use('/api/units', require('./routes/units'));

// ─── Auto backup scheduler (every 60 s) ──────────────────────────────────────
setInterval(() => { backupRouter.runDailySchedule(); }, 60 * 1000);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', async () => {
  try {
    await db.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true`);
  } catch (err) {
    console.error('Product status migration failed:', err.message);
  }

  // Ensure WMS_Backups directory exists
  const fs = require('fs');
  const path = require('path');
  const backupDir = path.join(__dirname, '../WMS_Backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const os = require('os');
  const networkInterfaces = os.networkInterfaces();
  let localIp = 'localhost';
  for (const interfaceName in networkInterfaces) {
    for (const net of networkInterfaces[interfaceName]) {
      if (net.family === 'IPv4' && !net.internal) {
        localIp = net.address;
        break;
      }
    }
  }
  console.log(`Server running on:`);
  console.log(`  ➜ Local:   http://localhost:${PORT}`);
  console.log(`  ➜ Network: http://${localIp}:${PORT}`);
  console.log('Running with Supabase Postgres');
});
