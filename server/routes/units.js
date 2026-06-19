const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../db');

// List all units
router.get('/', auth(['ADMIN', 'FIRM', 'AGENT']), async (req, res) => {
  try {
    const result = await db.query('SELECT name, created_at FROM units ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add new unit
router.post('/', auth(['ADMIN', 'FIRM', 'AGENT']), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Unit name is required' });
    }
    const cleanName = name.trim().toUpperCase();
    if (!cleanName) {
      return res.status(400).json({ error: 'Unit name cannot be empty' });
    }

    const dupCheck = await db.query('SELECT name FROM units WHERE name = $1 LIMIT 1', [cleanName]);
    if (dupCheck.rows.length > 0) {
      return res.status(400).json({ error: `Unit "${cleanName}" already exists.` });
    }

    const result = await db.query(
      'INSERT INTO units (name) VALUES ($1) RETURNING *',
      [cleanName]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete unit
router.delete('/:name', auth(['ADMIN', 'FIRM', 'AGENT']), async (req, res) => {
  try {
    const { name } = req.params;
    const cleanName = name.trim().toUpperCase();

    // Check if the unit is in use by products
    const inUseCheck = await db.query(
      'SELECT id FROM products WHERE unit = $1 OR alternate_unit = $1 LIMIT 1',
      [cleanName]
    );
    if (inUseCheck.rows.length > 0) {
      return res.status(400).json({
        error: `Cannot delete unit "${cleanName}" because it is currently in use by one or more products.`
      });
    }

    const result = await db.query('DELETE FROM units WHERE name = $1 RETURNING *', [cleanName]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: `Unit "${cleanName}" not found.` });
    }

    res.json({ success: true, message: `Unit "${cleanName}" deleted successfully.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
