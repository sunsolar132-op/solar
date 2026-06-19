/**
 * Migration: Centralized Party Master
 * - Removes firm_id constraint from parties (makes it global)
 * - Adds gst_number and category columns to parties
 * - Creates party_firm_access and party_agent_access tables
 * - Migrates existing firm-linked parties into party_firm_access
 */
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('Step 1: Adding gst_number and category to parties...');
    await client.query(`ALTER TABLE parties ADD COLUMN IF NOT EXISTS gst_number text NOT NULL DEFAULT ''`);
    await client.query(`ALTER TABLE parties ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'SALE'`);
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'parties_category_check'
        ) THEN
          ALTER TABLE parties ADD CONSTRAINT parties_category_check CHECK (category IN ('PURCHASE', 'SALE'));
        END IF;
      END $$;
    `);

    console.log('Step 2: Creating party_firm_access table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS party_firm_access (
        id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
        party_id text NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
        firm_id text NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(party_id, firm_id)
      )
    `);

    console.log('Step 3: Creating party_agent_access table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS party_agent_access (
        id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
        party_id text NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
        agent_id text NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(party_id, agent_id)
      )
    `);

    console.log('Step 4: Migrating existing parties into party_firm_access...');
    const hasFirmId = await client.query(`
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'parties' AND column_name = 'firm_id'
    `);

    if (hasFirmId.rows.length) {
      const parties = await client.query(`SELECT id, firm_id FROM parties WHERE firm_id IS NOT NULL`);
      for (const p of parties.rows) {
        await client.query(
          `INSERT INTO party_firm_access (party_id, firm_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [p.id, p.firm_id]
        );
      }
      console.log(`  -> Migrated ${parties.rows.length} existing parties.`);
    } else {
      console.log('  -> firm_id already removed; skipping access backfill.');
    }

    console.log('Step 5: Dropping old policies and columns...');
    await client.query(`DROP POLICY IF EXISTS parties_same_firm_read ON parties`);
    await client.query(`
      ALTER TABLE parties
        DROP COLUMN IF EXISTS firm_id CASCADE,
        DROP COLUMN IF EXISTS address CASCADE,
        DROP COLUMN IF EXISTS created_by_agent CASCADE
    `);

    console.log('Step 6: Dropping old index...');
    await client.query(`DROP INDEX IF EXISTS idx_parties_firm_id`);

    console.log('Step 7: Creating new indexes...');
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pfa_party_id ON party_firm_access(party_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pfa_firm_id ON party_firm_access(firm_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_paa_party_id ON party_agent_access(party_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_paa_agent_id ON party_agent_access(agent_id)`);

    await client.query('COMMIT');
    console.log('\nMigration complete!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\nMigration failed:', err.message);
    throw err;
  } finally {
    client.release();
    pool.end();
  }
}

migrate();
