const db = require('./db');
const { mapTransaction } = require('./mappers');

async function test() {
  try {
    const result = await db.query('SELECT * FROM transactions WHERE so_id IS NOT NULL LIMIT 1');
    console.log('Raw Row:', JSON.stringify(result.rows[0], null, 2));
    const mapped = mapTransaction(result.rows[0]);
    console.log('Mapped Entry:', JSON.stringify(mapped, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

test();
