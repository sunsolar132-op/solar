const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  try {
    console.log('Starting migration...');

    // 1. Create bill_items table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bill_items (
        id text primary key default gen_random_uuid()::text,
        transaction_id text not null references transactions(id) on delete cascade,
        product_id text not null,
        product_name text not null,
        qty numeric(18, 4) not null default 0,
        rate numeric(18, 4) not null default 0,
        amount numeric(18, 4) not null default 0,
        remark text not null default '',
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
    `);
    console.log('bill_items table created.');

    // 2. Add bill_no, total_qty to transactions
    await pool.query(`
      ALTER TABLE transactions 
      ADD COLUMN IF NOT EXISTS bill_no text,
      ADD COLUMN IF NOT EXISTS total_qty numeric(18, 4) not null default 0;
    `);
    console.log('Added bill_no and total_qty to transactions.');

    // 3. Make old columns nullable (since we are moving away from single product per transaction)
    await pool.query(`
      ALTER TABLE transactions
      ALTER COLUMN product_id DROP NOT NULL,
      ALTER COLUMN product_name DROP NOT NULL;
    `);
    console.log('Made product_id and product_name nullable in transactions.');

    // 4. Update total_qty based on qty for existing records (if any)
    await pool.query(`
      UPDATE transactions SET total_qty = qty WHERE total_qty = 0;
    `);
    console.log('Updated total_qty for existing records.');

    // 5. Migrate existing transaction data to bill_items (if the user deleted it, this does nothing, which is fine)
    await pool.query(`
      INSERT INTO bill_items (transaction_id, product_id, product_name, qty, rate, amount, remark)
      SELECT id, product_id, product_name, qty, rate, amount, remark
      FROM transactions
      WHERE product_id IS NOT NULL AND product_id != ''
      AND NOT EXISTS (
        SELECT 1 FROM bill_items WHERE bill_items.transaction_id = transactions.id
      );
    `);
    console.log('Migrated existing items to bill_items.');

    // 6. RLS for bill_items
    await pool.query(`
      ALTER TABLE bill_items ENABLE ROW LEVEL SECURITY;
      
      DROP POLICY IF EXISTS bill_items_global_read ON bill_items;
      CREATE POLICY bill_items_global_read ON bill_items
      FOR SELECT USING (true);
    `);
    console.log('RLS applied on bill_items.');

    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    pool.end();
  }
}

migrate();
