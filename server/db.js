require('dotenv').config();
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required to connect to Supabase Postgres');
}

const useSsl =
  process.env.PGSSLMODE === 'require' ||
  connectionString.includes('supabase.com') ||
  process.env.NODE_ENV === 'production';

const pool = new Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
});

pool.on('connect', () => {
  console.log('Connected to Supabase Postgres');
});

pool.on('error', (error) => {
  console.error('Postgres pool error:', error.message);
});

const query = (text, params = []) => pool.query(text, params);

const withTransaction = async (work) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  pool,
  query,
  withTransaction,
};
