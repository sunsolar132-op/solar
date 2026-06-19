// Delete transactions that have no linked bill_items (orphaned/bad entries)
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function clean() {
  // Show what will be deleted
  const preview = await pool.query(`
    SELECT t.id, t.party_name, t.type, t.amount, t.created_at 
    FROM transactions t
    LEFT JOIN bill_items bi ON t.id = bi.transaction_id
    WHERE bi.id IS NULL
    ORDER BY t.created_at DESC
  `);
  
  console.log('\n=== WILL DELETE these orphaned transactions ===');
  console.table(preview.rows);

  if (preview.rows.length === 0) {
    console.log('Nothing to clean.');
    pool.end();
    return;
  }

  // Delete them
  const result = await pool.query(`
    DELETE FROM transactions
    WHERE id IN (
      SELECT t.id FROM transactions t
      LEFT JOIN bill_items bi ON t.id = bi.transaction_id
      WHERE bi.id IS NULL
    )
  `);

  console.log(`\nDeleted ${result.rowCount} orphaned transaction(s).`);
  pool.end();
}

clean().catch(e => { console.error(e.message); pool.end(); });
