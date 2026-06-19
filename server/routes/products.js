const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../db');
const { mapProduct } = require('../mappers');

// Helper: check if a product has any bill_items references
async function isProductReferenced(productId) {
  const res = await db.query(
    `SELECT 1 FROM bill_items WHERE product_id = $1 LIMIT 1`,
    [productId]
  );
  return res.rows.length > 0;
}

router.get('/', auth(['ADMIN', 'FIRM', 'AGENT']), async (req, res) => {
  try {
    let firmId = null;
    if (req.user.role === 'FIRM') {
      firmId = req.user.id;
    } else if (req.user.role === 'AGENT') {
      firmId = req.user.firmId;
    }

    let result;
    if (firmId) {
      result = await db.query(
        `SELECT p.*,
            COALESCE(fpos.opening_stock_qty, 0) as opening_stock_qty,
            EXISTS(
              SELECT 1 FROM bill_items bi WHERE bi.product_id = p.id LIMIT 1
            ) AS is_referenced
         FROM products p
         LEFT JOIN firm_product_opening_stock fpos 
           ON p.id = fpos.product_id AND fpos.firm_id = $1
         ORDER BY p.created_at DESC`,
        [firmId]
      );
    } else {
      result = await db.query(
        `SELECT *,
            0 as opening_stock_qty,
            EXISTS(
              SELECT 1 FROM bill_items bi WHERE bi.product_id = p.id LIMIT 1
            ) AS is_referenced
         FROM products p
         ORDER BY created_at DESC`
      );
    }

    res.json(result.rows.map(mapProduct));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', auth(['ADMIN', 'FIRM', 'AGENT']), async (req, res) => {
  try {
    const { name, unit, alternateUnit, conversionFactor, lastSellingPrice, ctnPrice, openingStockQty } = req.body;
    if (!name) return res.status(400).json({ error: 'Product name is required' });

    // Duplicate check — case-insensitive, trimmed
    const dupCheck = await db.query(
      `SELECT id FROM products WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) LIMIT 1`,
      [name]
    );
    if (dupCheck.rows.length > 0) {
      return res.status(400).json({ error: `Product "${name.trim()}" already exists in the catalog.` });
    }

    const parsedLSP = lastSellingPrice != null && lastSellingPrice !== '' && !isNaN(lastSellingPrice)
      ? parseFloat(lastSellingPrice)
      : null;

    const parsedCTN = ctnPrice != null && ctnPrice !== '' && !isNaN(ctnPrice)
      ? parseFloat(ctnPrice)
      : null;

    const parsedOS = openingStockQty != null && openingStockQty !== '' && !isNaN(openingStockQty)
      ? parseFloat(openingStockQty)
      : 0;

    const result = await db.query(
      `INSERT INTO products (name, unit, alternate_unit, conversion_factor, last_selling_price, ctn_price)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name, unit || '', alternateUnit || null, conversionFactor ? parseFloat(conversionFactor) : 1.0, parsedLSP, parsedCTN]
    );


    const insertedProduct = result.rows[0];

    let firmId = null;
    if (req.user.role === 'FIRM') {
      firmId = req.user.id;
    } else if (req.user.role === 'AGENT') {
      firmId = req.user.firmId;
    }

    if (firmId) {
      await db.query(
        `INSERT INTO firm_product_opening_stock (firm_id, product_id, opening_stock_qty)
         VALUES ($1, $2, $3)
         ON CONFLICT (firm_id, product_id)
         DO UPDATE SET opening_stock_qty = EXCLUDED.opening_stock_qty`,
         [firmId, insertedProduct.id, parsedOS]
      );
    }

    const productRow = {
      ...insertedProduct,
      opening_stock_qty: firmId ? parsedOS : 0
    };
    const product = mapProduct(productRow);
    res.status(201).json({
      id: product.id,
      name: product.name,
      unit: product.unit,
      alternateUnit: product.alternateUnit,
      conversionFactor: product.conversionFactor,
      lastSellingPrice: product.lastSellingPrice,
      ctnPrice: product.ctnPrice,
      openingStockQty: product.openingStockQty,
      isActive: product.isActive,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id/status', auth(['ADMIN', 'FIRM', 'AGENT']), async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'isActive must be true or false' });
    }

    const result = await db.query(
      `UPDATE products
       SET is_active = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [isActive, id]
    );

    if (!result.rows.length) return res.status(404).json({ error: 'Product not found' });
    res.json(mapProduct(result.rows[0]));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', auth(['ADMIN', 'FIRM', 'AGENT']), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, unit, alternateUnit, conversionFactor, lastSellingPrice, ctnPrice, openingStockQty } = req.body;

    // Fetch current product to compare unit fields
    const existing = await db.query('SELECT * FROM products WHERE id = $1 LIMIT 1', [id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Product not found' });
    const current = existing.rows[0];

    // Check if product is referenced in any transactions
    const referenced = await isProductReferenced(id);

    // If referenced, block changes to unit, alternate_unit, conversion_factor
    if (referenced) {
      const unitChanged = unit != null && unit !== '' && unit !== current.unit;
      const altUnitChanged = (alternateUnit || null) !== (current.alternate_unit || null);
      const factorChanged = conversionFactor != null && parseFloat(conversionFactor) !== Number(current.conversion_factor);
      if (unitChanged || altUnitChanged || factorChanged) {
        return res.status(400).json({
          error: 'Cannot change unit, alternate unit, or conversion factor for a product that is used in existing transactions. Doing so would corrupt historical stock records.'
        });
      }
    }

    const parsedLSP = lastSellingPrice != null && lastSellingPrice !== '' && !isNaN(lastSellingPrice)
      ? parseFloat(lastSellingPrice)
      : null;

    const parsedCTN = ctnPrice != null && ctnPrice !== '' && !isNaN(ctnPrice)
      ? parseFloat(ctnPrice)
      : null;

    const parsedOS = openingStockQty != null && openingStockQty !== '' && !isNaN(openingStockQty)
      ? parseFloat(openingStockQty)
      : 0;

    // When referenced, preserve existing unit values
    const safeUnit = referenced ? current.unit : (unit || '');
    const safeAltUnit = referenced ? (current.alternate_unit || null) : (alternateUnit || null);
    const safeFactor = referenced ? Number(current.conversion_factor) : (conversionFactor ? parseFloat(conversionFactor) : 1.0);

    await db.query(
      `UPDATE products
       SET name = $1, unit = $2, alternate_unit = $3, conversion_factor = $4, last_selling_price = $5, ctn_price = $6, updated_at = NOW()
       WHERE id = $7`,
      [name, safeUnit, safeAltUnit, safeFactor, parsedLSP, parsedCTN, id]
    );

    let firmId = null;
    if (req.user.role === 'FIRM') {
      firmId = req.user.id;
    } else if (req.user.role === 'AGENT') {
      firmId = req.user.firmId;
    }

    if (firmId) {
      await db.query(
        `INSERT INTO firm_product_opening_stock (firm_id, product_id, opening_stock_qty)
         VALUES ($1, $2, $3)
         ON CONFLICT (firm_id, product_id)
         DO UPDATE SET opening_stock_qty = EXCLUDED.opening_stock_qty`,
        [firmId, id, parsedOS]
      );
    }

    res.json({ success: true, message: 'Product updated successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', auth(['ADMIN', 'FIRM', 'AGENT']), async (req, res) => {
  try {
    const referenced = await isProductReferenced(req.params.id);
    if (referenced) {
      return res.status(400).json({
        error: 'Cannot delete this product because it is used in existing transactions. Deleting it would corrupt sales, purchase, and stock records.'
      });
    }
    await db.query('DELETE FROM products WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Bulk Import from Excel ─────────────────────────────────────────────────
// Accepts an array of products; skips duplicates individually and returns a
// per-row result. This is idempotent and backward-compatible.
router.post('/bulk', auth(['ADMIN', 'FIRM', 'AGENT']), async (req, res) => {
  try {
    const { products } = req.body;
    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ error: 'No products provided' });
    }

    let firmId = null;
    if (req.user.role === 'FIRM') firmId = req.user.id;
    else if (req.user.role === 'AGENT') firmId = req.user.firmId;

    const results = [];

    for (const p of products) {
      const name = (p.name || '').trim();
      const unit = (p.unit || '').trim();
      if (!name || !unit) {
        results.push({ name, status: 'skipped', reason: 'Missing name or unit' });
        continue;
      }

      // Check for duplicate
      const dup = await db.query(
        `SELECT id FROM products WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) LIMIT 1`,
        [name]
      );
      if (dup.rows.length > 0) {
        results.push({ name, status: 'skipped', reason: 'Already exists in catalog' });
        continue;
      }

      const parsedLSP = p.lastSellingPrice != null && p.lastSellingPrice !== '' && !isNaN(p.lastSellingPrice)
        ? parseFloat(p.lastSellingPrice) : null;
      const parsedCTN = p.ctnPrice != null && p.ctnPrice !== '' && !isNaN(p.ctnPrice)
        ? parseFloat(p.ctnPrice) : null;
      const parsedOS = p.openingStockQty != null && p.openingStockQty !== '' && !isNaN(p.openingStockQty)
        ? parseFloat(p.openingStockQty) : 0;
      const altUnit = (p.alternateUnit || '').trim() || null;
      const factor = p.conversionFactor ? parseFloat(p.conversionFactor) : 1.0;

      const ins = await db.query(
        `INSERT INTO products (name, unit, alternate_unit, conversion_factor, last_selling_price, ctn_price)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [name, unit, altUnit, factor, parsedLSP, parsedCTN]
      );
      const newId = ins.rows[0].id;

      if (firmId) {
        await db.query(
          `INSERT INTO firm_product_opening_stock (firm_id, product_id, opening_stock_qty)
           VALUES ($1, $2, $3)
           ON CONFLICT (firm_id, product_id)
           DO UPDATE SET opening_stock_qty = EXCLUDED.opening_stock_qty`,
          [firmId, newId, parsedOS]
        );
      }

      results.push({ name, status: 'imported', id: newId });
    }

    res.status(201).json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
