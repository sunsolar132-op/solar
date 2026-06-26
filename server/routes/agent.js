const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../db');
const { mapParty, mapTransaction } = require('../mappers');

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
    items: Array.isArray(body.items) ? body.items : [],
    ...extra,
  };
}

// ── Edit History Helper ───────────────────────────────────────────────────────

// Normalise a value for comparison so cosmetic differences don't trigger a log entry.
function normaliseForCompare(raw) {
  const s = (raw ?? '').toString().trim();
  if (s !== '' && !isNaN(Number(s))) return String(parseFloat(s));
  const dateMatch = s.match(/^(\d{2}\/\d{2}\/)20(\d{2})$/);
  if (dateMatch) return dateMatch[1] + dateMatch[2];
  return s;
}

async function logEntryChanges({ entryId, entryType, changedById, changedByRole, changedByName, oldEntry, oldItems, newEntry, newItems, isCreation }) {
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
        if (normaliseForCompare(String(oldItem.qty)) !== normaliseForCompare(String(newItem.qty)))
          rows.push([entryId, entryType, `${name} — Qty`, String(oldItem.qty), String(newItem.qty), changedById, changedByRole, changedByName]);
        if (normaliseForCompare(String(oldItem.rate)) !== normaliseForCompare(String(newItem.rate)))
          rows.push([entryId, entryType, `${name} — Rate`, String(oldItem.rate), String(newItem.rate), changedById, changedByRole, changedByName]);
      }
    }
  }

  if (rows.length === 0) return;
  for (const r of rows) {
    await db.query(
      `INSERT INTO entry_edit_logs (entry_id, entry_type, field_name, old_value, new_value, changed_by_id, changed_by_role, changed_by_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      r
    );
  }
}

router.get('/delivery-info', auth(['AGENT']), async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'Date is required' });

    let searchDate = date;
    if (date.includes('-')) {
      const [y, m, d] = date.split('-');
      searchDate = `${d}/${m}/${y.slice(-2)}`;
    }

    const [firmResult, txResult] = await Promise.all([
      db.query('SELECT delivery_capacity FROM firms WHERE id = $1', [req.user.firmId]),
      db.query('SELECT type, total_qty FROM transactions WHERE firm_id = $1 AND delivery_date = $2', [req.user.firmId, searchDate]),
    ]);

    const capacity = firmResult.rows[0] ? Number(firmResult.rows[0].delivery_capacity) || 0 : 0;
    const used = txResult.rows
      .filter((tx) => ['SALE', 'SO', 'BOOK'].includes(tx.type))
      .reduce((sum, tx) => sum + (parseFloat(tx.total_qty) || 0), 0);

    res.json({ capacity, used, available: capacity - used });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/parties', auth(['AGENT']), async (req, res) => {
  try {
    const { category } = req.query;
    let query = `
      SELECT p.* 
      FROM parties p
      JOIN party_agent_access paa ON p.id = paa.party_id
      WHERE paa.agent_id = $1
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

router.get('/so', auth(['AGENT']), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT t.*, 
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
       WHERE t.firm_id = $1 AND t.created_by = $2
       GROUP BY t.id
       ORDER BY to_date(t.date, 'DD/MM/YY') DESC, t.created_at DESC`,
      [req.user.firmId, req.user.id]
    );
    const entries = result.rows
      .map(mapTransaction)
      .filter((e) => e.type === 'SO' || e.type === 'SO_RETURN');
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/so', auth(['AGENT']), async (req, res) => {
  try {
    const tx = buildTransactionPayload(req.body, {
      type: req.body.type || 'SO',
      firmId: req.user.firmId,
      createdBy: req.user.id,
      agentName: req.user.name,
      convertedFrom: null,
      convertedSaleId: null,
    });

    await calculateAndEnforceUnits(tx.items);
    tx.totalQty = tx.items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);

    const txResult = await db.query(
      `INSERT INTO transactions (
        date, party_id, party_name, remark_version, total_qty, amount,
        remark, delivery_date, so_id, bill_no, type, status, firm_id, created_by, agent_name,
        converted_from, converted_sale_id
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12, $13, $14, $15,
        $16, $17
      ) RETURNING id`,
      [
        tx.date, tx.partyId, tx.partyName, tx.remarkVersion, tx.totalQty, tx.amount,
        tx.remark, tx.deliveryDate, tx.soId, tx.billNo, tx.type, tx.status, tx.firmId, tx.createdBy, tx.agentName,
        tx.convertedFrom, tx.convertedSaleId,
      ]
    );

    const txId = txResult.rows[0].id;
    if (tx.items.length > 0) {
      const itemValues = tx.items.map(item => `('${txId}', '${item.productId}', '${item.productName.replace(/'/g, "''")}', ${Number(item.qty) || 0}, ${Number(item.rate) || 0}, ${Number(item.amount) || 0}, '${(item.remark || '').replace(/'/g, "''")}', ${item.qtyEntered == null ? 'NULL' : item.qtyEntered}, ${item.unitUsed ? `'${item.unitUsed}'` : 'NULL'}, ${item.qtyInStandardUnit == null ? 'NULL' : item.qtyInStandardUnit})`).join(',');
      await db.query(`
        INSERT INTO bill_items (transaction_id, product_id, product_name, qty, rate, amount, remark, qty_entered, unit_used, qty_in_standard_unit)
        VALUES ${itemValues}
      `);
    }
    await logEntryChanges({ entryId: txId, entryType: tx.type, changedById: req.user.id, changedByRole: 'AGENT', changedByName: req.user.name || 'Agent', isCreation: true });
    res.status(201).json({ success: true, message: 'SO created successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/book', auth(['AGENT']), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT t.*, 
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
       WHERE t.firm_id = $1 AND t.created_by = $2
       GROUP BY t.id
       ORDER BY to_date(t.date, 'DD/MM/YY') DESC, t.created_at DESC`,
      [req.user.firmId, req.user.id]
    );
    const entries = result.rows
      .map(mapTransaction)
      .filter((e) => e.type === 'BOOK' || e.type === 'BOOK_RETURN');
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/book', auth(['AGENT']), async (req, res) => {
  try {
    const tx = buildTransactionPayload(req.body, {
      type: req.body.type || 'BOOK',
      firmId: req.user.firmId,
      createdBy: req.user.id,
      agentName: req.user.name,
      convertedFrom: null,
      convertedSaleId: null,
    });

    await calculateAndEnforceUnits(tx.items);
    tx.totalQty = tx.items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);

    const txResult = await db.query(
      `INSERT INTO transactions (
        date, party_id, party_name, remark_version, total_qty, amount,
        remark, delivery_date, so_id, bill_no, type, status, firm_id, created_by, agent_name,
        converted_from, converted_sale_id
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12, $13, $14, $15,
        $16, $17
      ) RETURNING id`,
      [
        tx.date, tx.partyId, tx.partyName, tx.remarkVersion, tx.totalQty, tx.amount,
        tx.remark, tx.deliveryDate, tx.soId, tx.billNo, tx.type, tx.status, tx.firmId, tx.createdBy, tx.agentName,
        tx.convertedFrom, tx.convertedSaleId,
      ]
    );

    const txId = txResult.rows[0].id;
    if (tx.items.length > 0) {
      const itemValues = tx.items.map(item => `('${txId}', '${item.productId}', '${item.productName.replace(/'/g, "''")}', ${Number(item.qty) || 0}, ${Number(item.rate) || 0}, ${Number(item.amount) || 0}, '${(item.remark || '').replace(/'/g, "''")}', ${item.qtyEntered == null ? 'NULL' : item.qtyEntered}, ${item.unitUsed ? `'${item.unitUsed}'` : 'NULL'}, ${item.qtyInStandardUnit == null ? 'NULL' : item.qtyInStandardUnit})`).join(',');
      await db.query(`
        INSERT INTO bill_items (transaction_id, product_id, product_name, qty, rate, amount, remark, qty_entered, unit_used, qty_in_standard_unit)
        VALUES ${itemValues}
      `);
    }
    await logEntryChanges({ entryId: txId, entryType: tx.type, changedById: req.user.id, changedByRole: 'AGENT', changedByName: req.user.name || 'Agent', isCreation: true });
    res.status(201).json({ success: true, message: 'Book entry created successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/entries', auth(['AGENT']), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT t.*, 
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
       WHERE t.firm_id = $1 AND t.created_by = $2
       GROUP BY t.id
       ORDER BY t.date DESC, t.created_at DESC`,
      [req.user.firmId, req.user.id]
    );

    let entries = result.rows.map(mapTransaction);
    if (req.query.type) {
      entries = entries.filter((e) => e.type === req.query.type || e.type === `${req.query.type}_RETURN`);
    }
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/entries/:id', auth(['AGENT']), async (req, res) => {
  try {
    const tx = buildTransactionPayload(req.body);
    await calculateAndEnforceUnits(tx.items);
    tx.totalQty = tx.items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);

    const [oldTxResult, oldItemsResult] = await Promise.all([
      db.query('SELECT * FROM transactions WHERE id = $1 LIMIT 1', [req.params.id]),
      db.query('SELECT * FROM bill_items WHERE transaction_id = $1', [req.params.id]),
    ]);
    const oldEntry = oldTxResult.rows[0];
    const oldItems = oldItemsResult.rows;

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
        updated_at = NOW()
       WHERE id = $13`,
      [
        tx.date, tx.partyId, tx.partyName, tx.remarkVersion, tx.totalQty, tx.amount,
        tx.remark, tx.deliveryDate, tx.soId, tx.billNo, tx.type, tx.status, req.params.id,
      ]
    );

    // Delete existing items and re-insert
    await db.query(`DELETE FROM bill_items WHERE transaction_id = $1`, [req.params.id]);

    if (tx.items.length > 0) {
      const itemValues = tx.items.map(item => `('${req.params.id}', '${item.productId}', '${item.productName.replace(/'/g, "''")}', ${Number(item.qty) || 0}, ${Number(item.rate) || 0}, ${Number(item.amount) || 0}, '${(item.remark || '').replace(/'/g, "''")}', ${item.qtyEntered == null ? 'NULL' : item.qtyEntered}, ${item.unitUsed ? `'${item.unitUsed}'` : 'NULL'}, ${item.qtyInStandardUnit == null ? 'NULL' : item.qtyInStandardUnit})`).join(',');
      await db.query(`
        INSERT INTO bill_items (transaction_id, product_id, product_name, qty, rate, amount, remark, qty_entered, unit_used, qty_in_standard_unit)
        VALUES ${itemValues}
      `);
    }

    if (oldEntry) {
      await logEntryChanges({
        entryId: req.params.id, entryType: tx.type,
        changedById: req.user.id, changedByRole: 'AGENT', changedByName: req.user.name || 'Agent',
        oldEntry, oldItems, newEntry: tx, newItems: tx.items, isCreation: false,
      });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/entries/:id', auth(['AGENT']), async (req, res) => {
  try {
    await db.query('DELETE FROM transactions WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/dashboard', auth(['AGENT']), async (req, res) => {
  try {
    const today = new Date();
    const d = String(today.getDate()).padStart(2, '0');
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const y = String(today.getFullYear()).slice(-2);
    const todayStr = `${d}/${m}/${y}`;

    const [summaryResult, recentResult, topProductsResult, recentItemsResult] = await Promise.all([
      // 1. Summary Stats
      db.query(
        `SELECT 
          COUNT(*) FILTER (WHERE type = 'SO') as total_so_count,
          COALESCE(SUM(amount) FILTER (WHERE type = 'SO'), 0) as total_so_amount,
          COUNT(*) FILTER (WHERE type = 'BOOK') as total_book_count,
          COALESCE(SUM(amount) FILTER (WHERE type = 'BOOK'), 0) as total_book_amount,
          COUNT(*) FILTER (WHERE type = 'SO' AND date = $3) as today_so_count,
          COALESCE(SUM(amount) FILTER (WHERE type = 'SO' AND date = $3), 0) as today_so_amount,
          COUNT(*) FILTER (WHERE type = 'BOOK' AND date = $3) as today_book_count,
          COALESCE(SUM(amount) FILTER (WHERE type = 'BOOK' AND date = $3), 0) as today_book_amount
         FROM transactions 
         WHERE firm_id = $1 AND created_by = $2`,
        [req.user.firmId, req.user.id, todayStr]
      ),
      // 2. Recent Entries (Party-wise)
      db.query(
        `SELECT date, so_id, party_name, amount, delivery_date, type, status
         FROM transactions 
         WHERE firm_id = $1 AND created_by = $2
         ORDER BY created_at DESC LIMIT 10`,
        [req.user.firmId, req.user.id]
      ),
      // 3. Top Products (by qty in PO and BOOK)
      db.query(
        `SELECT bi.product_name, SUM(bi.qty) as total_qty
         FROM bill_items bi
         JOIN transactions t ON bi.transaction_id = t.id
         WHERE t.firm_id = $1 AND t.created_by = $2 AND t.type IN ('SO', 'BOOK')
         GROUP BY bi.product_name
         ORDER BY total_qty DESC LIMIT 5`,
        [req.user.firmId, req.user.id]
      ),
      // 4. Recent Items (Product-wise)
      db.query(
        `SELECT bi.product_name, bi.qty, bi.rate, t.date, t.party_name
         FROM bill_items bi
         JOIN transactions t ON bi.transaction_id = t.id
         WHERE t.firm_id = $1 AND t.created_by = $2
         ORDER BY t.created_at DESC LIMIT 10`,
        [req.user.firmId, req.user.id]
      )
    ]);

    const summary = summaryResult.rows[0];

    res.json({
      summary: {
        today: {
          soCount: parseInt(summary.today_so_count),
          soAmount: parseFloat(summary.today_so_amount),
          bookCount: parseInt(summary.today_book_count),
          bookAmount: parseFloat(summary.today_book_amount)
        },
        overall: {
          soCount: parseInt(summary.total_so_count),
          soAmount: parseFloat(summary.total_so_amount),
          bookCount: parseInt(summary.total_book_count),
          bookAmount: parseFloat(summary.total_book_amount)
        }
      },
      recentEntries: recentResult.rows.map(row => ({
        date: row.date,
        soNumber: row.so_id,
        partyName: row.party_name,
        amount: parseFloat(row.amount),
        deliveryDate: row.delivery_date,
        type: row.type,
        status: row.status
      })),
      recentItems: recentItemsResult.rows.map(row => ({
        productName: row.product_name,
        qty: parseFloat(row.qty),
        rate: parseFloat(row.rate),
        date: row.date,
        partyName: row.party_name
      })),
      topProducts: topProductsResult.rows.map(row => ({
        name: row.product_name,
        qty: parseFloat(row.total_qty)
      }))
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: err.message });
  }
});

function buildFirmStockSnapshot(txRows, outwardRows, productRows, adjRows = []) {
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

  // Apply quantity adjustments
  adjRows.forEach((adj) => {
    const s = stockMap[adj.product_id];
    if (!s) return;
    const qty = parseFloat(adj.qty) || 0;
    if (adj.adjustment_type === 'ADD') {
      s.physicalStock += qty;
      s.estimateStock += qty;
    } else if (adj.adjustment_type === 'REMOVE') {
      s.physicalStock -= qty;
      s.estimateStock -= qty;
    }
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

router.get('/livestock', auth(['AGENT']), async (req, res) => {
  try {
    const [txResult, outwardResult, productResult, adjResult] = await Promise.all([
      db.query(`
        SELECT t.id, t.type, t.status, t.delivery_status,
               bi.product_id, bi.product_name, bi.qty, bi.qty_in_standard_unit
        FROM transactions t
        LEFT JOIN bill_items bi ON t.id = bi.transaction_id
        WHERE t.firm_id = $1
      `, [req.user.firmId]),
      db.query('SELECT * FROM outward_details WHERE firm_id = $1', [req.user.firmId]),
      db.query(`
        SELECT p.id, p.name, p.unit, COALESCE(fpos.opening_stock_qty, 0) as opening_stock_qty
        FROM products p
        LEFT JOIN firm_product_opening_stock fpos 
          ON p.id = fpos.product_id AND fpos.firm_id = $1
      `, [req.user.firmId]),
      db.query('SELECT product_id, adjustment_type, qty FROM product_qty_adjustments WHERE firm_id = $1', [req.user.firmId]),
    ]);

    res.json(buildFirmStockSnapshot(txResult.rows, outwardResult.rows, productResult.rows, adjResult.rows));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/entries/:id/history', auth(['AGENT']), async (req, res) => {
  try {
    const { id } = req.params;
    // Agent can only see history for entries they created
    const check = await db.query(
      'SELECT id FROM transactions WHERE id = $1 AND created_by = $2 LIMIT 1',
      [id, req.user.id]
    );
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
