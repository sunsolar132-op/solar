// Quick debug script to test what the POST /entries endpoint receives
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function testInsert() {
  const testPayload = {
    date: '02/05/26',
    partyId: 'test-party',
    partyName: 'Test Party',
    remarkVersion: 'v1',
    totalQty: 10,
    amount: 5000,
    remark: 'test',
    deliveryDate: null,
    poId: null,
    billNo: 'BILL-TEST-001',
    type: 'PURCHASE',
    status: null,
    items: [
      { productId: 'prod-1', productName: 'Test Product', qty: 10, rate: 500, amount: 5000, remark: '' }
    ]
  };

  console.log('items array:', JSON.stringify(testPayload.items));
  console.log('items is array:', Array.isArray(testPayload.items));
  console.log('items length:', testPayload.items.length);

  pool.end();
}

testInsert().catch(e => { console.error(e.message); pool.end(); });
