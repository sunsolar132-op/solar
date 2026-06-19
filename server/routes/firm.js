const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../db');
const bcrypt = require('bcryptjs');
const { mapFirm, mapAgent, mapParty, mapTransaction } = require('../mappers');

async function calculateAndEnforceUnits(items) {
  if (!items || items.length === 0) return;
  const productIds = items.map(item => item.productId).filter(Boolean);
  if (productIds.length === 0) return;

  const productsRes = await db.query(
    'SELECT id, unit, alternate_unit, conversion_factor FROM products WHERE id = ANY($1)',
    [productIds]
  );
  const productsMap = Object.fromEntries(productsRes.rows.map(p => [p.id, p]));

  for (const item of items) {
    const prod = productsMap[item.productId];
    const standardUnit = prod ? prod.unit : '';
    const altUnit = prod ? prod.alternate_unit : null;
    const factor = prod ? Number(prod.conversion_factor) || 1.0 : 1.0;

    const qtyEntered = Number(item.qtyEntered || item.qty) || 0;
    const unitUsed = item.unitUsed || standardUnit || '';

    let qtyInStandardUnit = qtyEntered;
    if (altUnit && unitUsed === altUnit) {
      qtyInStandardUnit = qtyEntered * factor;
    }

    item.qtyEntered = qtyEntered;
    item.unitUsed = unitUsed;
    item.qtyInStandardUnit = qtyInStandardUnit;
    item.qty = qtyInStandardUnit;
  }
}


function buildTransactionPayload(body, extra = {}) {
  return {
    date: body.date,
    partyId: body.partyId,
    partyName: body.partyName,
    remarkVersion: body.remarkVersion || '',
    totalQty: Number(body.totalQty) || 0,
    amount: Number(body.amount) || 0,
    remark: body.remark || '',
    deliveryDate: body.deliveryDate || null,
    soId: body.soId || body.poId || null,
    billNo: body.billNo || null,
    type: body.type,
    status: body.status || null,
    deliveryStatus: body.deliveryStatus || 'Pending',
    completedAt: body.completedAt || null,
    items: Array.isArray(body.items) ? body.items : [],
    ...extra,
  };
}

function genBillNo() {
  return 'BILL-' + Date.now().toString().slice(-6) + Math.floor(Math.random() * 1000);
}

// ── Edit History Helper ───────────────────────────────────────────────────────

// Normalise a value for comparison so cosmetic differences don't trigger a log entry.
// - Numbers: parse as float so "10.0000" == "10"
// - Dates: normalise DD/MM/YYYY and DD/MM/YY to DD/MM/YY
async function insertBillItems(execute, transactionId, items) {
  for (const item of items) {
    await execute(
      `INSERT INTO bill_items (
        transaction_id, product_id, product_name, qty, rate, amount, remark,
        qty_entered, unit_used, qty_in_standard_unit
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        transactionId,
        item.productId || item.product_id,
        item.productName || item.product_name || '',
        Number(item.qty) || 0,
        Number(item.rate) || 0,
        Number(item.amount) || 0,
        item.remark || '',
        item.qtyEntered ?? item.qty_entered ?? null,
        item.unitUsed ?? item.unit_used ?? null,
        item.qtyInStandardUnit ?? item.qty_in_standard_unit ?? item.qty ?? null,
      ]
    );
  }
}

async function saveOutwardDetails(client, firmId, billId, billType, transportDetails = {}, verificationItems = []) {
  await client.query(
    'DELETE FROM outward_details WHERE bill_id = $1 AND firm_id = $2',
    [billId, firmId]
  );

  for (const item of verificationItems) {
    const origProd = await client.query('SELECT name FROM products WHERE id = $1', [item.originalProductId]);
    const delivProd = await client.query('SELECT name, unit, alternate_unit, conversion_factor FROM products WHERE id = $1', [item.deliveredProductId]);
    const origName = origProd.rows[0]?.name || item.originalProductName || '';
    const delivName = delivProd.rows[0]?.name || item.deliveredProductName || '';

    const prod = delivProd.rows[0];
    const standardUnit = prod ? prod.unit : '';
    const altUnit = prod ? prod.alternate_unit : null;
    const factor = prod ? Number(prod.conversion_factor) || 1.0 : 1.0;

    const qtyEntered = Number(item.deliveredQtyEntered || item.deliveredQty) || 0;
    const unitUsed = item.deliveredUnitUsed || standardUnit || '';
    const qtyInStandardUnit = altUnit && unitUsed === altUnit ? qtyEntered * factor : qtyEntered;

    await client.query(`
      INSERT INTO outward_details (
        firm_id, bill_id, bill_type,
        original_product_id, original_product_name, original_qty,
        delivered_product_id, delivered_product_name, delivered_qty,
        vehicle_no, transport_id, person_name, mobile,
        qty_entered, unit_used, qty_in_standard_unit
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
    `, [
      firmId, billId, billType,
      item.originalProductId, origName, item.originalQty,
      item.deliveredProductId, delivName, qtyInStandardUnit,
      transportDetails.vehicleNo || '', transportDetails.transportId || '',
      transportDetails.personName || '', transportDetails.mobile || '',
      qtyEntered, unitUsed, qtyInStandardUnit
    ]);
  }
}

function normaliseForCompare(raw) {
  const s = (raw ?? '').toString().trim();
  // Numeric?
  if (s !== '' && !isNaN(Number(s))) {
    return String(parseFloat(s));
  }
  // Date in DD/MM/YYYY → DD/MM/YY
  const dateMatch = s.match(/^(\d{2}\/\d{2}\/)20(\d{2})$/);
  if (dateMatch) return dateMatch[1] + dateMatch[2];
  return s;
}

async function logEntryChanges(client, { entryId, entryType, changedById, changedByRole, changedByName, oldEntry, oldItems, newEntry, newItems, isCreation }) {
  const rows = [];

  if (isCreation) {
    rows.push([entryId, entryType, 'Entry Created', null, 'Created', changedById, changedByRole, changedByName]);
  } else {
    const fieldMap = [
      ['date',          'Date',          oldEntry.date,           newEntry.date],
      ['party_name',    'Party',         oldEntry.party_name,     newEntry.partyName],
      ['remark_version','Ref',           oldEntry.remark_version, newEntry.remarkVersion],
      ['remark',        'Narration',     oldEntry.remark,         newEntry.remark],
      ['delivery_date', 'Delivery Date', oldEntry.delivery_date,  newEntry.deliveryDate],
      ['total_qty',     'Total Qty',     String(oldEntry.total_qty ?? ''), String(newEntry.totalQty ?? '')],
      ['amount',        'Amount',        String(oldEntry.amount ?? ''),    String(newEntry.amount ?? '')],
      ['status',        'Status',        oldEntry.status,         newEntry.status],
    ];

    for (const [, label, oldVal, newVal] of fieldMap) {
      const o = normaliseForCompare(oldVal);
      const n = normaliseForCompare(newVal);
      if (o !== n) {
        rows.push([entryId, entryType, label,
          (oldVal ?? '').toString().trim() || null,
          (newVal ?? '').toString().trim() || null,
          changedById, changedByRole, changedByName]);
      }
    }

    // Track item-level changes (products added, removed, qty/rate changed)
    const oldMap = Object.fromEntries((oldItems || []).map(i => [i.product_id, i]));
    const newMap = Object.fromEntries((newItems || []).map(i => [i.productId, i]));
    const allProductIds = new Set([...Object.keys(oldMap), ...Object.keys(newMap)]);

    for (const pid of allProductIds) {
      const oldItem = oldMap[pid];
      const newItem = newMap[pid];
      const name = (newItem || oldItem).productName || (newItem || oldItem).product_name || pid;

      if (!oldItem && newItem) {
        rows.push([entryId, entryType, 'Product Added', null, name, changedById, changedByRole, changedByName]);
      } else if (oldItem && !newItem) {
        rows.push([entryId, entryType, 'Product Removed', name, null, changedById, changedByRole, changedByName]);
      } else {
        if (normaliseForCompare(String(oldItem.qty)) !== normaliseForCompare(String(newItem.qty))) {
          rows.push([entryId, entryType, `${name} — Qty`, String(oldItem.qty), String(newItem.qty), changedById, changedByRole, changedByName]);
        }
        if (normaliseForCompare(String(oldItem.rate)) !== normaliseForCompare(String(newItem.rate))) {
          rows.push([entryId, entryType, `${name} — Rate`, String(oldItem.rate), String(newItem.rate), changedById, changedByRole, changedByName]);
        }
      }
    }
  }

  if (rows.length === 0) return;

  const execute = client ? (sql, p) => client.query(sql, p) : (sql, p) => require('../db').query(sql, p);

  for (const r of rows) {
    await execute(
      `INSERT INTO entry_edit_logs (entry_id, entry_type, field_name, old_value, new_value, changed_by_id, changed_by_role, changed_by_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      r
    );
  }
}

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

router.get('/test-health', (req, res) => res.json({ status: 'firm ok' }));

router.get('/dashboard-stats', auth(['FIRM']), async (req, res) => {
  try {
    const today = new Date();
    const d = String(today.getDate()).padStart(2, '0');
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const y = String(today.getFullYear()).slice(-2);
    const todayStr = `${d}/${m}/${y}`;

    const [
      summaryResult, 
      recentResult, 
      txResult, 
      outwardResult, 
      productResult,
      pendingTxResult,
      firmResult,
      todayTxResult
    ] = await Promise.all([
      // 1. Summary Stats (Today vs Overall)
      db.query(
        `SELECT 
          COUNT(*) FILTER (WHERE type = 'SALE') as sale_count,
          COALESCE(SUM(amount) FILTER (WHERE type = 'SALE'), 0) as sale_amount,
          COUNT(*) FILTER (WHERE type = 'PURCHASE') as purchase_count,
          COALESCE(SUM(amount) FILTER (WHERE type = 'PURCHASE'), 0) as purchase_amount,
          COUNT(*) FILTER (WHERE type = 'SO' AND COALESCE(status, '') != 'Converted') as so_count,
          COALESCE(SUM(amount) FILTER (WHERE type = 'SO' AND COALESCE(status, '') != 'Converted'), 0) as so_amount,
          COUNT(*) FILTER (WHERE type = 'BOOK' AND COALESCE(status, '') != 'Converted') as book_count,
          COALESCE(SUM(amount) FILTER (WHERE type = 'BOOK' AND COALESCE(status, '') != 'Converted'), 0) as book_amount,
          
          COUNT(*) FILTER (WHERE type = 'SALE' AND date = $2) as today_sale_count,
          COALESCE(SUM(amount) FILTER (WHERE type = 'SALE' AND date = $2), 0) as today_sale_amount,
          COUNT(*) FILTER (WHERE type = 'PURCHASE' AND date = $2) as today_purchase_count,
          COALESCE(SUM(amount) FILTER (WHERE type = 'PURCHASE' AND date = $2), 0) as today_purchase_amount
         FROM transactions 
         WHERE firm_id = $1`,
        [req.user.id, todayStr]
      ),
      // 2. Recent Entries
      db.query(
        `SELECT * FROM transactions 
         WHERE firm_id = $1 
         ORDER BY created_at DESC LIMIT 10`,
        [req.user.id]
      ),
      // 3. Transactions for stocksnapshot
      db.query(
        `SELECT t.id, t.type, t.status, t.delivery_status, bi.product_id, bi.product_name, bi.qty, bi.qty_in_standard_unit
         FROM transactions t
         LEFT JOIN bill_items bi ON t.id = bi.transaction_id
         WHERE t.firm_id = $1`,
        [req.user.id]
      ),
      // 4. Outward details
      db.query('SELECT * FROM outward_details WHERE firm_id = $1', [req.user.id]),
      // 5. Products list
      db.query(`
        SELECT p.id, p.name, p.unit, COALESCE(fpos.opening_stock_qty, 0) as opening_stock_qty
        FROM products p
        LEFT JOIN firm_product_opening_stock fpos 
          ON p.id = fpos.product_id AND fpos.firm_id = $1
      `, [req.user.id]),
      // 6. Pending Deliveries Transactions
      db.query(
        `SELECT * FROM transactions
         WHERE firm_id = $1
           AND type IN ('SALE', 'SO', 'BOOK')
           AND COALESCE(status, '') != 'Converted'
           AND COALESCE(delivery_status, 'Pending') != 'Completed'`,
        [req.user.id]
      ),
      // 7. Firm delivery capacity
      db.query('SELECT delivery_capacity FROM firms WHERE id = $1', [req.user.id]),
      // 8. Today's transactions for capacity calculation
      db.query(
        `SELECT type, total_qty, status FROM transactions 
         WHERE firm_id = $1 AND delivery_date = $2`, 
        [req.user.id, todayStr]
      )
    ]);

    // Map pending deliveries and fetch their items
    let pendingDeliveries = [];
    if (pendingTxResult.rows.length > 0) {
      const txIds = pendingTxResult.rows.map(r => r.id);
      const itemsResult = await db.query(
        `SELECT * FROM bill_items WHERE transaction_id = ANY($1) ORDER BY id`,
        [txIds]
      );
      
      const { mapBillItem } = require('../mappers');
      
      const itemsMap = {};
      itemsResult.rows.forEach(row => {
        if (!itemsMap[row.transaction_id]) {
          itemsMap[row.transaction_id] = [];
        }
        itemsMap[row.transaction_id].push(mapBillItem(row));
      });

      pendingDeliveries = pendingTxResult.rows.map(row => {
        const tx = mapTransaction(row);
        tx.items = itemsMap[row.id] || [];
        return tx;
      });

      const parseDDMMYY = (str) => {
        if (!str) return new Date(0);
        const parts = str.split('/');
        if (parts.length !== 3) return new Date(0);
        let day = parseInt(parts[0], 10);
        let month = parseInt(parts[1], 10) - 1;
        let year = parseInt(parts[2], 10);
        if (year < 100) year += 2000;
        return new Date(year, month, day);
      };

      pendingDeliveries.sort((a, b) => {
        const dateA = parseDDMMYY(a.deliveryDate || a.date);
        const dateB = parseDDMMYY(b.deliveryDate || b.date);
        return dateA - dateB;
      });
    }

    // Capacity calculation
    const capacity = firmResult.rows[0] ? Number(firmResult.rows[0].delivery_capacity) || 0 : 0;
    const used = todayTxResult.rows
      .filter((tx) => ['SALE', 'SO', 'BOOK'].includes(tx.type) && tx.status !== 'Converted')
      .reduce((sum, tx) => sum + (parseFloat(tx.total_qty) || 0), 0);

    const todayCapacity = {
      capacity,
      used,
      available: capacity - used
    };

    // Summary calculations
    const summary = summaryResult.rows[0] || {};
    summary.pending_deliveries_count = pendingDeliveries.length;
    summary.pending_deliveries_amount = pendingDeliveries.reduce((sum, tx) => sum + (tx.amount || 0), 0);

    const fullStockSnapshot = buildFirmStockSnapshot(txResult.rows, outwardResult.rows, productResult.rows);
    const criticalStockItems = fullStockSnapshot.filter((item) => item.estimateStock <= 0);
    summary.critical_stock_count = criticalStockItems.length;

    const lowStock = criticalStockItems
      .sort((a, b) => a.estimateStock - b.estimateStock)
      .slice(0, 10)
      .map((item) => ({
        id: item.productId,
        name: item.productName,
        stock: item.estimateStock,
      }));

    res.json({
      summary,
      recentEntries: recentResult.rows.map(mapTransaction),
      lowStock,
      pendingDeliveries,
      todayCapacity
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/profile', auth(['FIRM']), async (req, res) => {
  try {
    await db.query(
      'UPDATE firms SET delivery_capacity = $1, updated_at = NOW() WHERE id = $2',
      [Number(req.body.deliveryCapacity) || 0, req.user.id]
    );
    res.json({ success: true, message: 'Settings updated' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/delivery-info', auth(['FIRM']), async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'Date is required' });

    let searchDate = date;
    if (date.includes('-')) {
      const [y, m, d] = date.split('-');
      searchDate = `${d}/${m}/${y.slice(-2)}`;
    }

    const [firmResult, txResult] = await Promise.all([
      db.query('SELECT delivery_capacity FROM firms WHERE id = $1', [req.user.id]),
      db.query('SELECT type, total_qty FROM transactions WHERE firm_id = $1 AND delivery_date = $2', [req.user.id, searchDate]),
    ]);

    const capacity = firmResult.rows[0] ? Number(firmResult.rows[0].delivery_capacity) || 0 : 0;
    const used = txResult.rows
      .filter((tx) => ['SALE', 'SO', 'BOOK'].includes(tx.type) && tx.status !== 'Converted')
      .reduce((sum, tx) => sum + (parseFloat(tx.total_qty) || 0), 0);

    res.json({ capacity, used, available: capacity - used });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/agents', auth(['FIRM']), async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM agents WHERE firm_id = $1 ORDER BY created_at DESC', [req.user.id]);
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

router.post('/agents', auth(['FIRM']), async (req, res) => {
  try {
    const { name, email, password, mobile } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });

    const hashedPassword = await bcrypt.hash(password, 10);
    await db.query(
      `INSERT INTO agents (name, email, password_hash, password_hint, mobile, firm_id, role)
       VALUES ($1, $2, $3, $4, $5, $6, 'AGENT')`,
      [name, email.toLowerCase().trim(), hashedPassword, password, mobile || null, req.user.id]
    );

    res.status(201).json({ success: true, message: 'Agent registered successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/agents/:id', auth(['FIRM']), async (req, res) => {
  try {
    const { id } = req.params;
    const agentResult = await db.query('SELECT * FROM agents WHERE id = $1 LIMIT 1', [id]);
    if (!agentResult.rows.length || agentResult.rows[0].firm_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to update this agent' });
    }

    const { name, email, password, mobile } = req.body;
    const fields = [];
    const values = [];
    let index = 1;

    if (name !== undefined) { fields.push(`name = $${index++}`); values.push(name); }
    if (email !== undefined) { fields.push(`email = $${index++}`); values.push(email.toLowerCase().trim()); }
    if (mobile !== undefined) { fields.push(`mobile = $${index++}`); values.push(mobile); }
    if (password) {
      fields.push(`password_hash = $${index++}`);
      values.push(await bcrypt.hash(password, 10));
      fields.push(`password_hint = $${index++}`);
      values.push(password);
    }

    fields.push('updated_at = NOW()');
    values.push(id);

    await db.query(`UPDATE agents SET ${fields.join(', ')} WHERE id = $${index}`, values);
    res.json({ success: true, message: 'Agent updated successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/agents/:id', auth(['FIRM']), async (req, res) => {
  try {
    const { id } = req.params;
    const agentResult = await db.query('SELECT firm_id FROM agents WHERE id = $1 LIMIT 1', [id]);
    if (!agentResult.rows.length || agentResult.rows[0].firm_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to delete this agent' });
    }
    await db.query('DELETE FROM agents WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Firm profile (for bill printing) ─────────────────────────
router.get('/profile', auth(['FIRM']), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, name, email, mobile, delivery_capacity
       FROM firms WHERE id = $1 LIMIT 1`,
      [req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Firm not found' });
    const r = result.rows[0];
    res.json({
      id:              r.id,
      name:            r.name,
      email:           r.email,
      mobile:          r.mobile,
      deliveryCapacity: Number(r.delivery_capacity) || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/parties', auth(['FIRM']), async (req, res) => {
  try {
    const { category } = req.query;
    let query = `
      SELECT p.* 
      FROM parties p
      JOIN party_firm_access pfa ON p.id = pfa.party_id
      WHERE pfa.firm_id = $1
    `;
    const params = [req.user.id];

    if (category) {
      query += ` AND p.category = $2`;
      params.push(category.toUpperCase());
    }

    query += ` ORDER BY p.name ASC`;

    const result = await db.query(query, params);
    res.json(result.rows.map(mapParty));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/entries', auth(['FIRM']), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT t.*, 
        p.gst_number AS party_gst,
        p.mobile     AS party_mobile,
        conv.delivery_date   AS converted_delivery_date,
        conv.delivery_status AS converted_delivery_status,
        COALESCE(
          json_agg(
            json_build_object(
              'id', bi.id, 'transaction_id', bi.transaction_id, 'product_id', bi.product_id, 
              'product_name', bi.product_name, 'qty', bi.qty, 'rate', bi.rate, 
              'amount', bi.amount, 'remark', bi.remark,
              'qty_entered', bi.qty_entered, 'unit_used', bi.unit_used, 'qty_in_standard_unit', bi.qty_in_standard_unit
            )
          ) FILTER (WHERE bi.id IS NOT NULL), '[]'
        ) as items
       FROM transactions t
       LEFT JOIN bill_items bi ON t.id = bi.transaction_id
       LEFT JOIN parties p ON t.party_id = p.id
       LEFT JOIN transactions conv ON t.converted_sale_id = conv.id
       WHERE t.firm_id = $1 
       GROUP BY t.id, p.gst_number, p.mobile, conv.delivery_date, conv.delivery_status
       ORDER BY to_date(t.date, 'DD/MM/YY') DESC, t.created_at DESC`,
      [req.user.id]
    );

    let entries = result.rows.map(mapTransaction);
    const { type } = req.query;
    if (type) {
      if (type.endsWith('_ALL')) {
        const base = type.replace('_ALL', '');
        entries = entries.filter((e) => e.type === base || e.type === `${base}_RETURN`);
      } else {
        entries = entries.filter((e) => e.type === type);
      }
    }

    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/entries', auth(['FIRM']), async (req, res) => {
  try {
    const tx = buildTransactionPayload(req.body, {
      firmId: req.user.id,
      createdBy: req.user.id,
      agentName: null,
      convertedFrom: null,
      convertedSaleId: null,
    });


    await calculateAndEnforceUnits(tx.items);
    tx.totalQty = tx.items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);

    if (!tx.billNo && ['PURCHASE', 'SALE', 'PURCHASE_RETURN', 'SALE_RETURN'].includes(tx.type)) {
      tx.billNo = genBillNo();
    }

    // Insert main transaction
    const txResult = await db.query(
      `INSERT INTO transactions (
        date, party_id, party_name, remark_version, total_qty, amount,
        remark, delivery_date, so_id, bill_no, type, status, delivery_status, completed_at, firm_id, created_by, agent_name,
        converted_from, converted_sale_id
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
        $18, $19
      ) RETURNING id`,
      [
        tx.date, tx.partyId, tx.partyName, tx.remarkVersion, tx.totalQty, tx.amount,
        tx.remark, tx.deliveryDate, tx.soId, tx.billNo, tx.type, tx.status, tx.deliveryStatus, tx.completedAt, tx.firmId, tx.createdBy, tx.agentName,
        tx.convertedFrom, tx.convertedSaleId,
      ]
    );

    const txId = txResult.rows[0].id;

    await insertBillItems((sql, params) => db.query(sql, params), txId, tx.items);

    // Log entry creation
    await logEntryChanges(null, {
      entryId: txId, entryType: tx.type,
      changedById: req.user.id, changedByRole: 'FIRM', changedByName: req.user.name || 'Firm',
      isCreation: true,
    });

    res.status(201).json({ success: true, message: 'Entry saved successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/entries/:id', auth(['FIRM']), async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch old entry + items before update for diff logging
    const [oldTxResult, oldItemsResult] = await Promise.all([
      db.query('SELECT * FROM transactions WHERE id = $1 LIMIT 1', [id]),
      db.query('SELECT * FROM bill_items WHERE transaction_id = $1', [id]),
    ]);
    const oldEntry = oldTxResult.rows[0];
    if (!oldEntry) return res.status(404).json({ error: 'Entry not found' });
    const oldItems = oldItemsResult.rows;
    const tx = buildTransactionPayload({
      ...req.body,
      status: req.body.status ?? oldEntry.status,
      deliveryStatus: req.body.deliveryStatus ?? oldEntry.delivery_status,
      completedAt: req.body.completedAt ?? oldEntry.completed_at,
    });

    await calculateAndEnforceUnits(tx.items);
    tx.totalQty = tx.items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);

    await db.query(
      `UPDATE transactions SET
        date = $1,
        party_id = $2,
        party_name = $3,
        remark_version = $4,
        total_qty = $5,
        amount = $6,
        remark = $7,
        delivery_date = $8,
        so_id = $9,
        bill_no = $10,
        type = $11,
        status = $12,
        delivery_status = $13,
        completed_at = $14,
        updated_at = NOW()
       WHERE id = $15 AND firm_id = $16`,
      [
        tx.date, tx.partyId, tx.partyName, tx.remarkVersion, tx.totalQty, tx.amount,
        tx.remark, tx.deliveryDate, tx.soId, tx.billNo, tx.type, tx.status, tx.deliveryStatus, tx.completedAt, id, req.user.id,
      ]
    );

    // Delete existing items and re-insert
    await db.query(`DELETE FROM bill_items WHERE transaction_id = $1`, [id]);

    await insertBillItems((sql, params) => db.query(sql, params), id, tx.items);

    // Log changes
    if (oldEntry) {
      await logEntryChanges(null, {
        entryId: id, entryType: tx.type,
        changedById: req.user.id, changedByRole: 'FIRM', changedByName: req.user.name || 'Firm',
        oldEntry, oldItems, newEntry: tx, newItems: tx.items, isCreation: false,
      });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/entries/:id', auth(['FIRM']), async (req, res) => {
  try {
    const del = await db.query(
      'DELETE FROM transactions WHERE id = $1 AND firm_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (!del.rows.length) return res.status(404).json({ error: 'Entry not found or access denied' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/convert-to-sale', auth(['FIRM']), async (req, res) => {
  try {
    const { entryId, saleData } = req.body;
    if (!entryId || !saleData) return res.status(400).json({ error: 'Missing entryId or saleData' });

    const saleId = await db.withTransaction(async (client) => {
      // Fetch original entry to check status and get original ID
      const entryResult = await client.query('SELECT so_id, status, converted_sale_id FROM transactions WHERE id = $1 AND firm_id = $2 LIMIT 1', [entryId, req.user.id]);
      if (!entryResult.rows.length) throw new Error('Source entry not found');

      const originalEntry = entryResult.rows[0];
      if (originalEntry.status === 'Converted' || originalEntry.converted_sale_id) {
        throw new Error('Entry is already converted to sale');
      }

      const saleTx = buildTransactionPayload(saleData, {
        type: 'SALE',
        firmId: req.user.id,
        createdBy: req.user.id,
        agentName: null,
        convertedFrom: entryId,
        convertedSaleId: null,
        soId: originalEntry.so_id,
        // Persist the original SO/Book ID as the bill number
        billNo: saleData.billNo || originalEntry.so_id || genBillNo()
      });

      await calculateAndEnforceUnits(saleTx.items);
      saleTx.totalQty = saleTx.items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);

      const saleResult = await client.query(
        `INSERT INTO transactions (
          date, party_id, party_name, remark_version, total_qty, amount,
          remark, delivery_date, so_id, bill_no, type, status, firm_id, created_by, agent_name,
          converted_from, converted_sale_id
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17
        )
        RETURNING id`,
        [
          saleTx.date, saleTx.partyId, saleTx.partyName, saleTx.remarkVersion, saleTx.totalQty, saleTx.amount,
          saleTx.remark, saleTx.deliveryDate, saleTx.soId, saleTx.billNo, saleTx.type, saleTx.status, saleTx.firmId, saleTx.createdBy, saleTx.agentName,
          saleTx.convertedFrom, saleTx.convertedSaleId,
        ]
      );

      const sId = saleResult.rows[0].id;

      await insertBillItems((sql, params) => client.query(sql, params), sId, saleTx.items);

      await client.query(
        'UPDATE transactions SET status = $1, converted_sale_id = $2, updated_at = NOW() WHERE id = $3',
        ['Converted', sId, entryId]
      );

      return sId;
    });

    res.status(201).json({ success: true, saleId });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/livestock', auth(['FIRM']), async (req, res) => {
  try {
    const [txResult, outwardResult, productResult] = await Promise.all([
      db.query(`
        SELECT t.id, t.type, t.status, t.delivery_status, bi.product_id, bi.product_name, bi.qty, bi.qty_in_standard_unit
        FROM transactions t
        LEFT JOIN bill_items bi ON t.id = bi.transaction_id
        WHERE t.firm_id = $1
      `, [req.user.id]),
      db.query('SELECT * FROM outward_details WHERE firm_id = $1', [req.user.id]),
      db.query(`
        SELECT p.id, p.name, p.unit, COALESCE(fpos.opening_stock_qty, 0) as opening_stock_qty
        FROM products p
        LEFT JOIN firm_product_opening_stock fpos 
          ON p.id = fpos.product_id AND fpos.firm_id = $1
      `, [req.user.id]),
    ]);

    res.json(buildFirmStockSnapshot(txResult.rows, outwardResult.rows, productResult.rows));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Stock Ledger ─────────────────────────────────────────────────────────────

function toISO(dateStr) {
  if (!dateStr) return '';
  if (dateStr instanceof Date) return dateStr.toISOString().slice(0, 10);
  dateStr = String(dateStr);
  if (dateStr.includes('-')) return dateStr;
  const parts = dateStr.split('/');
  if (parts.length !== 3) return dateStr;
  const [d, m, y] = parts;
  const year = y.length === 2 ? `20${y}` : y;
  return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

router.get('/stock-ledger', auth(['FIRM']), async (req, res) => {
  try {
    const { productId, dateFrom, dateTo } = req.query;
    if (!productId) return res.status(400).json({ error: 'productId is required' });

    const firmId = req.user.id;

    const [txResult, outwardResult, openingResult] = await Promise.all([
      db.query(`
        SELECT
          t.id, t.type, t.status, t.delivery_status, t.date,
          t.bill_no, t.party_name, t.so_id,
          bi.product_id, bi.product_name, bi.qty,
          bi.qty_entered, bi.unit_used, bi.qty_in_standard_unit, bi.rate, bi.amount
        FROM transactions t
        LEFT JOIN bill_items bi
          ON t.id = bi.transaction_id
         AND bi.product_id = $2
        WHERE t.firm_id = $1
          AND t.type IN ('PURCHASE', 'PURCHASE_RETURN', 'SALE', 'SALE_RETURN')
          AND (
            (t.type != 'SALE' AND bi.id IS NOT NULL)
            OR (
              t.type = 'SALE'
              AND t.delivery_status = 'Completed'
              AND (
                bi.id IS NOT NULL
                OR EXISTS (
                  SELECT 1
                  FROM outward_details od
                  WHERE od.firm_id = t.firm_id
                    AND od.bill_id = t.id
                    AND od.delivered_product_id = $2
                )
              )
            )
          )
      `, [firmId, productId]),
      db.query(`
        SELECT bill_id, delivered_product_id, delivered_qty
        FROM outward_details
        WHERE firm_id = $1 AND delivered_product_id = $2
      `, [firmId, productId]),
      db.query(`
        SELECT COALESCE(fpos.opening_stock_qty, 0) AS opening_stock_qty
        FROM firm_product_opening_stock fpos
        WHERE fpos.product_id = $1 AND fpos.firm_id = $2
        LIMIT 1
      `, [productId, firmId]),
    ]);

    const openingStockQty = parseFloat(openingResult.rows[0]?.opening_stock_qty || 0);

    // Build outward map: bill_id → total delivered qty for this product
    const outwardQtyMap = {};
    outwardResult.rows.forEach((od) => {
      outwardQtyMap[od.bill_id] = (outwardQtyMap[od.bill_id] || 0) + parseFloat(od.delivered_qty || 0);
    });

    // Group tx rows by transaction id
    const txMap = {};
    txResult.rows.forEach((row) => {
      if (!txMap[row.id]) {
        txMap[row.id] = {
          id: row.id, type: row.type, status: row.status,
          deliveryStatus: row.delivery_status,
          date: row.date, billNo: row.bill_no, partyName: row.party_name, soId: row.so_id,
          items: [],
        };
      }
      if (row.product_id) {
        txMap[row.id].items.push({ qty: parseFloat(row.qty_in_standard_unit ?? row.qty) || 0 });
      }
    });

    // Build raw ledger rows
    const allRows = [];

    Object.values(txMap).forEach((tx) => {
      const totalBillQty = tx.items.reduce((s, i) => s + i.qty, 0);
      const isoDate = toISO(tx.date);
      const billNo = tx.billNo || tx.soId || '—';

      if (tx.type === 'PURCHASE') {
        allRows.push({ isoDate, date: tx.date, billId: tx.id, billNo, partyName: tx.partyName, type: 'PURCHASE', detailLabel: 'Purchase', qtyIn: totalBillQty, qtyOut: 0 });
      } else if (tx.type === 'PURCHASE_RETURN') {
        allRows.push({ isoDate, date: tx.date, billId: tx.id, billNo, partyName: tx.partyName, type: 'PURCHASE_RETURN', detailLabel: 'Purchase Return', qtyIn: 0, qtyOut: totalBillQty });
      } else if (tx.type === 'SALE_RETURN') {
        allRows.push({ isoDate, date: tx.date, billId: tx.id, billNo, partyName: tx.partyName, type: 'SALE_RETURN', detailLabel: 'Sale Return', qtyIn: totalBillQty, qtyOut: 0 });
      } else if (tx.type === 'SALE' && tx.deliveryStatus === 'Completed') {
        const outwardQty = outwardQtyMap[tx.id] || 0;
        const saleQty = outwardQty > 0 ? outwardQty : totalBillQty;
        if (saleQty > 0) {
          allRows.push({ isoDate, date: tx.date, billId: tx.id, billNo, partyName: tx.partyName, type: 'SALE', detailLabel: outwardQty > 0 ? 'Sale (Outward)' : 'Sale (Bill Qty)', qtyIn: 0, qtyOut: saleQty });
        }
      }
      // Pending SALE, SO, BOOK → excluded
    });

    // Sort chronologically
    allRows.sort((a, b) => a.isoDate.localeCompare(b.isoDate));

    // Compute opening balance for the period
    let openingBalance = openingStockQty;
    let filteredRows = allRows;

    if (dateFrom) {
      const beforeRows = allRows.filter((r) => r.isoDate < dateFrom);
      openingBalance = openingStockQty + beforeRows.reduce((s, r) => s + r.qtyIn - r.qtyOut, 0);
      filteredRows = allRows.filter((r) => r.isoDate >= dateFrom);
    }

    if (dateTo) {
      filteredRows = filteredRows.filter((r) => r.isoDate <= dateTo);
    }

    // Add running balance
    let balance = openingBalance;
    const ledgerRows = filteredRows.map((row) => {
      balance += row.qtyIn - row.qtyOut;
      return {
        date: row.date,
        billId: row.billId,
        billNo: row.billNo,
        partyName: row.partyName,
        type: row.type,
        detailLabel: row.detailLabel,
        qtyIn: row.qtyIn,
        qtyOut: row.qtyOut,
        balance,
      };
    });

    const totalIn = filteredRows.reduce((s, r) => s + r.qtyIn, 0);
    const totalOut = filteredRows.reduce((s, r) => s + r.qtyOut, 0);

    res.json({
      openingStockQty,
      openingBalance,
      hasDateFilter: !!(dateFrom || dateTo),
      rows: ledgerRows,
      summary: { totalIn, totalOut, closingBalance: balance },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Single transaction fetch (for Bill Details popup in Stock Ledger)
router.get('/transaction/:id', auth(['FIRM']), async (req, res) => {
  try {
    const { id } = req.params;
    const [txResult, itemsResult] = await Promise.all([
      db.query('SELECT * FROM transactions WHERE id = $1 AND firm_id = $2 LIMIT 1', [id, req.user.id]),
      db.query('SELECT * FROM bill_items WHERE transaction_id = $1 ORDER BY id', [id]),
    ]);
    if (!txResult.rows.length) return res.status(404).json({ error: 'Not found' });
    const { mapTransaction, mapBillItem } = require('../mappers');
    const tx = mapTransaction(txResult.rows[0]);
    tx.items = itemsResult.rows.map(mapBillItem);
    res.json(tx);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/mark-complete', auth(['FIRM']), async (req, res) => {
  const { billId, transportDetails, verificationItems } = req.body;

  try {
    await db.withTransaction(async (client) => {
      const txResult = await client.query('SELECT * FROM transactions WHERE id = $1', [billId]);
      if (!txResult.rows.length) throw new Error('Transaction not found');
      const originalTx = txResult.rows[0];
      if (originalTx.firm_id !== req.user.id) throw new Error('Transaction not found');

      let targetBillId = billId;
      let billType = originalTx.type;

      if (originalTx.type === 'SO' || originalTx.type === 'BOOK') {
        if (originalTx.status === 'Converted' || originalTx.converted_sale_id) {
          throw new Error('Entry is already converted to sale');
        }
        const now = new Date();
        const d = String(now.getDate()).padStart(2, '0');
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const y = String(now.getFullYear()).slice(-2);
        const todayStr = `${d}/${m}/${y}`;

        const saleResult = await client.query(
          `INSERT INTO transactions (
            date, party_id, party_name, remark_version, total_qty, amount,
            remark, delivery_date, so_id, bill_no, type, status, delivery_status, completed_at, firm_id, created_by, agent_name,
            converted_from
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING id`,
          [
            todayStr, originalTx.party_id, originalTx.party_name, originalTx.remark_version, originalTx.total_qty, originalTx.amount,
            originalTx.remark, originalTx.delivery_date, originalTx.so_id, genBillNo(), 'SALE', null,
            'Completed', new Date(), originalTx.firm_id, req.user.id, originalTx.agent_name, billId
          ]
        );
        targetBillId = saleResult.rows[0].id;
        billType = 'SALE';

        const itemsResult = await client.query('SELECT * FROM bill_items WHERE transaction_id = $1', [billId]);
        await insertBillItems((sql, params) => client.query(sql, params), targetBillId, itemsResult.rows);

        await client.query(
          'UPDATE transactions SET status = $1, delivery_status = $2, converted_sale_id = $3, completed_at = $4, updated_at = NOW() WHERE id = $5',
          ['Converted', 'Completed', targetBillId, new Date(), billId]
        );
      } else if (originalTx.type === 'SALE') {
        if (originalTx.delivery_status === 'Completed') {
          throw new Error('Sale is already delivered. Use Edit Outward / Stock to change delivery details.');
        }
        await client.query(
          'UPDATE transactions SET delivery_status = $1, completed_at = $2, updated_at = NOW() WHERE id = $3',
          ['Completed', new Date(), billId]
        );
      }

      if (verificationItems && verificationItems.length > 0) {
        await saveOutwardDetails(client, req.user.id, targetBillId, billType, transportDetails, verificationItems);
      }
    });


    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/outward-details/:billId', auth(['FIRM']), async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        od.*,
        p_orig.name  AS original_product_name,
        p_deliv.name AS delivered_product_name
      FROM outward_details od
      LEFT JOIN products p_orig  ON od.original_product_id  = p_orig.id
      LEFT JOIN products p_deliv ON od.delivered_product_id = p_deliv.id
      WHERE od.bill_id = $1 AND od.firm_id = $2
    `, [req.params.billId, req.user.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/outward-details/:billId', auth(['FIRM']), async (req, res) => {
  const { billId } = req.params;
  const { transportDetails, verificationItems } = req.body;

  try {
    await db.withTransaction(async (client) => {
      const txResult = await client.query(
        `SELECT id, type, firm_id, delivery_status
         FROM transactions
         WHERE id = $1 AND firm_id = $2
         LIMIT 1`,
        [billId, req.user.id]
      );
      if (!txResult.rows.length) throw new Error('Sale bill not found');

      const tx = txResult.rows[0];
      if (tx.type !== 'SALE') throw new Error('Outward details can only be edited for sale bills');
      if (tx.delivery_status !== 'Completed') throw new Error('Only delivered sale bills have outward details to edit');
      if (!Array.isArray(verificationItems) || verificationItems.length === 0) {
        throw new Error('At least one outward product row is required');
      }

      await saveOutwardDetails(client, req.user.id, billId, 'SALE', transportDetails, verificationItems);
    });

    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/track-order/:id', auth(['FIRM']), async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Search by ID or Bill No or SO ID
    const searchResult = await db.query(
      `SELECT * FROM transactions 
       WHERE firm_id = $1 AND (id = $2 OR bill_no = $2 OR so_id = $2)
       LIMIT 1`,
      [req.user.id, id]
    );

    if (!searchResult.rows.length) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const mainTx = mapTransaction(searchResult.rows[0]);

    // 2. Find conversion history (if any)
    const conversions = await db.query(
      `SELECT * FROM transactions 
       WHERE firm_id = $1 AND converted_from = $2`,
      [req.user.id, mainTx.id]
    );

    // 3. Find if this was converted FROM something
    let convertedFromTx = null;
    if (mainTx.converted_from) {
      const fromResult = await db.query(
        `SELECT * FROM transactions WHERE id = $1 AND firm_id = $2`,
        [mainTx.converted_from, req.user.id]
      );
      if (fromResult.rows.length) {
        convertedFromTx = mapTransaction(fromResult.rows[0]);
      }
    }

    res.json({
      order: mainTx,
      conversions: conversions.rows.map(mapTransaction),
      source: convertedFromTx
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/so-statement', auth(['FIRM']), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT t.*, 
        COALESCE(
          json_agg(
            json_build_object(
              'id', bi.id, 'transaction_id', bi.transaction_id, 'product_id', bi.product_id, 
              'product_name', bi.product_name, 'qty', bi.qty, 'rate', bi.rate, 
              'amount', bi.amount, 'remark', bi.remark
            )
          ) FILTER (WHERE bi.id IS NOT NULL), '[]'
        ) as items
       FROM transactions t
       LEFT JOIN bill_items bi ON t.id = bi.transaction_id
       WHERE t.firm_id = $1 AND t.type IN ('SO', 'SO_RETURN')
       GROUP BY t.id
       ORDER BY to_date(t.date, 'DD/MM/YY') DESC, t.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows.map(mapTransaction));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/book-statement', auth(['FIRM']), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT t.*, 
        COALESCE(
          json_agg(
            json_build_object(
              'id', bi.id, 'transaction_id', bi.transaction_id, 'product_id', bi.product_id, 
              'product_name', bi.product_name, 'qty', bi.qty, 'rate', bi.rate, 
              'amount', bi.amount, 'remark', bi.remark
            )
          ) FILTER (WHERE bi.id IS NOT NULL), '[]'
        ) as items
       FROM transactions t
       LEFT JOIN bill_items bi ON t.id = bi.transaction_id
       WHERE t.firm_id = $1 AND t.type IN ('BOOK', 'BOOK_RETURN')
       GROUP BY t.id
       ORDER BY to_date(t.date, 'DD/MM/YY') DESC, t.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows.map(mapTransaction));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/entries/:id/history', auth(['FIRM']), async (req, res) => {
  try {
    const { id } = req.params;
    // Verify this entry belongs to this firm
    const check = await db.query('SELECT id FROM transactions WHERE id = $1 AND firm_id = $2 LIMIT 1', [id, req.user.id]);
    if (!check.rows.length) return res.status(403).json({ error: 'Access denied' });

    const result = await db.query(
      `SELECT * FROM entry_edit_logs WHERE entry_id = $1 ORDER BY changed_at DESC`,
      [id]
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
