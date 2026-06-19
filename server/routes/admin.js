const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../db');
const bcrypt = require('bcryptjs');
const { mapFirm, mapAgent } = require('../mappers');

const normalizePartyCategory = (category) => {
  const value = String(category || 'SALE').trim().toUpperCase();
  if (!['PURCHASE', 'SALE'].includes(value)) {
    return null;
  }
  return value;
};

// ─── PARTY MASTER (Admin Only) ───────────────────────────────────────────────

// GET all parties (central)
router.get('/parties', auth(['ADMIN']), async (req, res) => {
  try {
    const result = await db.query(`SELECT * FROM parties ORDER BY name ASC`);
    res.json(result.rows.map(r => ({
      id: r.id, name: r.name, gstNumber: r.gst_number || '', mobile: r.mobile || '', category: r.category || 'SALE', createdAt: r.created_at,
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST create party
router.post('/parties', auth(['ADMIN']), async (req, res) => {
  try {
    const { name, gstNumber, mobile, category } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Party name is required' });
    const normalizedCategory = normalizePartyCategory(category);
    if (!normalizedCategory) return res.status(400).json({ error: 'Invalid party category' });

    // Check if name already exists (case-insensitive)
    const nameCheck = await db.query(
      `SELECT id FROM parties WHERE LOWER(name) = LOWER($1)`,
      [name.trim()]
    );
    if (nameCheck.rows.length > 0) {
      return res.status(400).json({ error: 'An entity with this name is already registered' });
    }

    // Check if GST number already exists (if provided)
    if (gstNumber?.trim()) {
      const gstCheck = await db.query(
        `SELECT id, name FROM parties WHERE LOWER(gst_number) = LOWER($1)`,
        [gstNumber.trim()]
      );
      if (gstCheck.rows.length > 0) {
        return res.status(400).json({
          error: `GST Number is already registered under party "${gstCheck.rows[0].name}"`
        });
      }
    }

    const result = await db.query(
      `INSERT INTO parties (name, gst_number, mobile, category) VALUES ($1, $2, $3, $4) RETURNING *`,
      [name.trim(), gstNumber?.trim() || '', mobile?.trim() || '', normalizedCategory]
    );
    const r = result.rows[0];
    res.status(201).json({ id: r.id, name: r.name, gstNumber: r.gst_number, mobile: r.mobile, category: r.category });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// PUT update party
router.put('/parties/:id', auth(['ADMIN']), async (req, res) => {
  try {
    const { name, gstNumber, mobile, category } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Party name is required' });
    const normalizedCategory = normalizePartyCategory(category);
    if (!normalizedCategory) return res.status(400).json({ error: 'Invalid party category' });

    // Check if name already exists (case-insensitive, other than this party)
    const nameCheck = await db.query(
      `SELECT id FROM parties WHERE LOWER(name) = LOWER($1) AND id != $2`,
      [name.trim(), req.params.id]
    );
    if (nameCheck.rows.length > 0) {
      return res.status(400).json({ error: 'An entity with this name is already registered' });
    }

    // Check if GST number already exists (if provided, other than this party)
    if (gstNumber?.trim()) {
      const gstCheck = await db.query(
        `SELECT id, name FROM parties WHERE LOWER(gst_number) = LOWER($1) AND id != $2`,
        [gstNumber.trim(), req.params.id]
      );
      if (gstCheck.rows.length > 0) {
        return res.status(400).json({
          error: `GST Number is already registered under party "${gstCheck.rows[0].name}"`
        });
      }
    }

    const result = await db.query(
      `UPDATE parties
       SET name=$1, gst_number=$2, mobile=$3, category=$4, updated_at=NOW()
       WHERE id=$5
       RETURNING *`,
      [name.trim(), gstNumber?.trim() || '', mobile?.trim() || '', normalizedCategory, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Party not found' });

    if (normalizedCategory === 'PURCHASE') {
      await db.query('DELETE FROM party_agent_access WHERE party_id = $1', [req.params.id]);
    }

    const r = result.rows[0];
    res.json({ id: r.id, name: r.name, gstNumber: r.gst_number, mobile: r.mobile, category: r.category });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// DELETE party
router.delete('/parties/:id', auth(['ADMIN']), async (req, res) => {
  try {
    await db.query('DELETE FROM parties WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET firm access for a party
router.get('/parties/:id/firms', auth(['ADMIN']), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT firm_id FROM party_firm_access WHERE party_id = $1`, [req.params.id]
    );
    res.json(result.rows.map(r => r.firm_id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT set firm access for a party (full replace)
router.put('/parties/:id/firms', auth(['ADMIN']), async (req, res) => {
  try {
    const { firmIds } = req.body; // array of firm IDs
    await db.query('DELETE FROM party_firm_access WHERE party_id = $1', [req.params.id]);
    if (Array.isArray(firmIds) && firmIds.length > 0) {
      const vals = firmIds.map((fid, i) => `($1, $${i + 2})`).join(',');
      await db.query(`INSERT INTO party_firm_access (party_id, firm_id) VALUES ${vals} ON CONFLICT DO NOTHING`,
        [req.params.id, ...firmIds]);
    }
    // Also remove agent access for agents not belonging to any remaining firm
    if (!firmIds || firmIds.length === 0) {
      await db.query('DELETE FROM party_agent_access WHERE party_id = $1', [req.params.id]);
    } else {
      const firmPlaceholders = firmIds.map((_, i) => `$${i + 2}`).join(',');
      await db.query(
        `DELETE FROM party_agent_access WHERE party_id = $1 AND agent_id NOT IN (
          SELECT id FROM agents WHERE firm_id IN (${firmPlaceholders})
        )`,
        [req.params.id, ...firmIds]
      );
    }
    res.json({ success: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// GET agent access for a party
router.get('/parties/:id/agents', auth(['ADMIN']), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT agent_id FROM party_agent_access WHERE party_id = $1`, [req.params.id]
    );
    res.json(result.rows.map(r => r.agent_id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT set agent access for a party (full replace)
router.put('/parties/:id/agents', auth(['ADMIN']), async (req, res) => {
  try {
    const { agentIds } = req.body; // array of agent IDs
    await db.query('DELETE FROM party_agent_access WHERE party_id = $1', [req.params.id]);
    if (Array.isArray(agentIds) && agentIds.length > 0) {
      const vals = agentIds.map((_, i) => `($1, $${i + 2})`).join(',');
      await db.query(`INSERT INTO party_agent_access (party_id, agent_id) VALUES ${vals} ON CONFLICT DO NOTHING`,
        [req.params.id, ...agentIds]);
    }
    res.json({ success: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// GET all agents across all firms (for Admin access control UI)
router.get('/all-agents', auth(['ADMIN']), async (req, res) => {
  try {
    const result = await db.query(`
      SELECT a.id, a.name, a.email, a.mobile, a.firm_id, f.name as firm_name
      FROM agents a JOIN firms f ON a.firm_id = f.id
      ORDER BY f.name, a.name
    `);
    res.json(result.rows.map(r => ({
      id: r.id, name: r.name, email: r.email, mobile: r.mobile,
      firmId: r.firm_id, firmName: r.firm_name,
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/firms', auth(['ADMIN']), async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM firms ORDER BY created_at DESC');
    const firms = result.rows.map((row) => {
      const firm = mapFirm(row);
      delete firm.password;
      return firm;
    });
    res.json(firms);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/firms', auth(['ADMIN']), async (req, res) => {
  try {
    const { name, email, password, mobile, deliveryCapacity } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });

    const hashedPassword = await bcrypt.hash(password, 10);
    await db.query(
      `INSERT INTO firms (
        name, email, password_hash, password_hint, mobile, delivery_capacity, role
      ) VALUES ($1, $2, $3, $4, $5, $6, 'FIRM')`,
      [
        name,
        email.toLowerCase().trim(),
        hashedPassword,
        password,
        mobile || null,
        parseFloat(deliveryCapacity) || 0,
      ]
    );

    res.status(201).json({ success: true, message: 'Firm created successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/firms/:id', auth(['ADMIN']), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, password, mobile, deliveryCapacity } = req.body;

    const fields = [];
    const values = [];
    let index = 1;

    if (name !== undefined) { fields.push(`name = $${index++}`); values.push(name); }
    if (email !== undefined) { fields.push(`email = $${index++}`); values.push(email.toLowerCase().trim()); }
    if (mobile !== undefined) { fields.push(`mobile = $${index++}`); values.push(mobile); }
    if (deliveryCapacity !== undefined) { fields.push(`delivery_capacity = $${index++}`); values.push(Number(deliveryCapacity) || 0); }
    if (password) {
      fields.push(`password_hash = $${index++}`);
      values.push(await bcrypt.hash(password, 10));
      fields.push(`password_hint = $${index++}`);
      values.push(password);
    }

    fields.push('updated_at = NOW()');
    values.push(id);

    await db.query(`UPDATE firms SET ${fields.join(', ')} WHERE id = $${index}`, values);
    res.json({ success: true, message: 'Firm updated successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/firms/:id', auth(['ADMIN']), async (req, res) => {
  try {
    await db.query('DELETE FROM firms WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/firms/:id/agents', auth(['ADMIN', 'FIRM']), async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM agents WHERE firm_id = $1 ORDER BY created_at DESC', [req.params.id]);
    const agents = result.rows.map((row) => {
      const agent = mapAgent(row);
      delete agent.password;
      return agent;
    });
    res.json(agents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function buildFirmStockSnapshot(txRows, outwardRows, productRows) {
  const products = Object.fromEntries(productRows.map((row) => [row.id, row]));
  const outwardMap = {};

  outwardRows.forEach((od) => {
    if (!outwardMap[od.bill_id]) outwardMap[od.bill_id] = [];
    outwardMap[od.bill_id].push(od);
  });

  const stockMap = {};

  // Pre-populate stockMap for all products with their opening stock quantity
  productRows.forEach((p) => {
    const opening = parseFloat(p.opening_stock_qty) || 0;
    stockMap[p.id] = {
      productId: p.id,
      productName: p.name || 'Unknown',
      productUnit: p.unit || '',
      purchase: 0,
      sale: 0,
      purchaseReturn: 0,
      saleReturn: 0,
      po: 0,
      book: 0,
      openingStock: opening,
      physicalStock: opening,
      estimateStock: opening,
    };
  });

  const getStockEntry = (pid, pname) => {
    if (!pid) return null;

    if (!stockMap[pid]) {
      stockMap[pid] = {
        productId: pid,
        productName: products[pid]?.name || pname || 'Unknown',
        productUnit: products[pid]?.unit || '',
        purchase: 0,
        sale: 0,
        purchaseReturn: 0,
        saleReturn: 0,
        po: 0,
        book: 0,
        openingStock: 0,
        physicalStock: 0,
        estimateStock: 0,
      };
    }

    return stockMap[pid];
  };

  const txGroups = {};
  txRows.forEach((row) => {
    if (!txGroups[row.id]) {
      txGroups[row.id] = {
        id: row.id,
        type: row.type,
        status: row.status,
        deliveryStatus: row.delivery_status,
        items: [],
      };
    }

    if (row.product_id) txGroups[row.id].items.push(row);
  });

  Object.values(txGroups).forEach((tx) => {
    const isCompleted = tx.deliveryStatus === 'Completed';
    const isPending = tx.status !== 'Converted';
    const outwardItems = outwardMap[tx.id];
    const getQty = (item) => parseFloat(item.qty_in_standard_unit ?? item.qty) || 0;

    if (tx.type === 'SALE') {
      if (isCompleted) {
        const itemsToProcess = outwardItems?.length
          ? outwardItems.map((oi) => ({ product_id: oi.delivered_product_id, product_name: oi.delivered_product_name, qty: oi.qty_in_standard_unit ?? oi.delivered_qty }))
          : tx.items;

        itemsToProcess.forEach((item) => {
          const s = getStockEntry(item.product_id, item.product_name);
          if (!s) return;
          const q = getQty(item);
          s.sale += q;
          s.physicalStock -= q;
          s.estimateStock -= q;
        });
      } else {
        tx.items.forEach((item) => {
          const s = getStockEntry(item.product_id, item.product_name);
          if (!s) return;
          const q = getQty(item);
          s.sale += q;
          s.physicalStock -= q;
          s.estimateStock -= q;
        });
      }
    } else if (tx.type === 'PURCHASE') {
      tx.items.forEach((item) => {
        const s = getStockEntry(item.product_id, item.product_name);
        if (!s) return;
        const q = getQty(item);
        s.purchase += q;
        s.physicalStock += q;
        s.estimateStock += q;
      });
    } else if (tx.type === 'PURCHASE_RETURN') {
      tx.items.forEach((item) => {
        const s = getStockEntry(item.product_id, item.product_name);
        if (!s) return;
        const q = getQty(item);
        s.purchaseReturn += q;
        s.physicalStock -= q;
        s.estimateStock -= q;
      });
    } else if (tx.type === 'SALE_RETURN') {
      tx.items.forEach((item) => {
        const s = getStockEntry(item.product_id, item.product_name);
        if (!s) return;
        const q = getQty(item);
        s.saleReturn += q;
        s.physicalStock += q;
        s.estimateStock += q;
      });
    } else if (tx.type === 'SO' && isPending) {
      tx.items.forEach((item) => {
        const s = getStockEntry(item.product_id, item.product_name);
        if (!s) return;
        const q = getQty(item);
        s.po += q;
        s.estimateStock -= q;
      });
    } else if (tx.type === 'BOOK' && isPending) {
      tx.items.forEach((item) => {
        const s = getStockEntry(item.product_id, item.product_name);
        if (!s) return;
        const q = getQty(item);
        s.book += q;
        s.estimateStock -= q;
      });
    }
  });

  return Object.values(stockMap);
}

router.get('/firms/:id/livestock', auth(['ADMIN']), async (req, res) => {
  try {
    const firmId = req.params.id;

    const [txResult, outwardResult, productResult] = await Promise.all([
      db.query(`
        SELECT t.id, t.type, t.status, t.delivery_status,
               bi.product_id, bi.product_name, bi.qty, bi.qty_in_standard_unit
        FROM transactions t
        LEFT JOIN bill_items bi ON t.id = bi.transaction_id
        WHERE t.firm_id = $1
      `, [firmId]),
      db.query('SELECT * FROM outward_details WHERE firm_id = $1', [firmId]),
      db.query(`
        SELECT p.id, p.name, p.unit, COALESCE(fpos.opening_stock_qty, 0) as opening_stock_qty
        FROM products p
        LEFT JOIN firm_product_opening_stock fpos 
          ON p.id = fpos.product_id AND fpos.firm_id = $1
      `, [firmId]),
    ]);

    res.json(buildFirmStockSnapshot(txResult.rows, outwardResult.rows, productResult.rows));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Entry edit history — Admin sees all entries across all firms
router.get('/entries/:id/history', auth(['ADMIN']), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM entry_edit_logs WHERE entry_id = $1 ORDER BY changed_at DESC`,
      [req.params.id]
    );
    res.json(result.rows.map(r => ({
      id: r.id,
      entryId: r.entry_id,
      entryType: r.entry_type,
      fieldName: r.field_name,
      oldValue: r.old_value,
      newValue: r.new_value,
      changedById: r.changed_by_id,
      changedByRole: r.changed_by_role,
      changedByName: r.changed_by_name,
      changedAt: r.changed_at,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
