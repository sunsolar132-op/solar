const db = require('../db');
const firmId = '9e79049e-2173-4f1b-a7f8-8dd3af57e1e3';
const productId = '26934f2c-facb-4eb4-8dc6-8acbb042710c';

function toISO(dateStr) {
  if (!dateStr) return '';
  if (dateStr.includes('-')) return dateStr;
  const parts = dateStr.split('/');
  if (parts.length !== 3) return dateStr;
  const [d, m, y] = parts;
  const year = y.length === 2 ? `20${y}` : y;
  return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

async function main() {
  try {
    const [txResult, outwardResult, openingResult] = await Promise.all([
      db.query(`
        SELECT
          t.id, t.type, t.status, t.delivery_status, t.date,
          t.bill_no, t.party_name, t.so_id,
          bi.product_id, bi.product_name, bi.qty,
          bi.qty_entered, bi.unit_used, bi.rate, bi.amount
        FROM transactions t
        JOIN bill_items bi ON t.id = bi.transaction_id
        WHERE t.firm_id = $1
          AND bi.product_id = $2
          AND t.type IN ('PURCHASE', 'PURCHASE_RETURN', 'SALE', 'SALE_RETURN')
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
      txMap[row.id].items.push({ qty: parseFloat(row.qty) || 0 });
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
        // Only include if outward verified qty exists
        if (outwardQty > 0) {
          allRows.push({ isoDate, date: tx.date, billId: tx.id, billNo, partyName: tx.partyName, type: 'SALE', detailLabel: 'Sale (Outward)', qtyIn: 0, qtyOut: outwardQty });
        }
      }
    });

    // Sort chronologically
    allRows.sort((a, b) => a.isoDate.localeCompare(b.isoDate));

    // Compute opening balance for the period
    let openingBalance = openingStockQty;
    let filteredRows = allRows;

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

    console.log(JSON.stringify({
      openingStockQty,
      openingBalance,
      rows: ledgerRows,
      summary: { totalIn, totalOut, closingBalance: balance },
    }, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

main();
