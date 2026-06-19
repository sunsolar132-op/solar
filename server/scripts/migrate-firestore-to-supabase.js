require('dotenv').config();
const admin = require('firebase-admin');
const path = require('path');
const { withTransaction } = require('../db');

const serviceAccountPath = path.join(__dirname, '..', 'firebase-service-account.json');
const serviceAccount = require(serviceAccountPath);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const firestore = admin.firestore();

const readCollection = async (name) => {
  const snapshot = await firestore.collection(name).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
};

async function main() {
  const [firms, agents, products, parties, transactions] = await Promise.all([
    readCollection('firms'),
    readCollection('agents'),
    readCollection('products'),
    readCollection('parties'),
    readCollection('transactions'),
  ]);

  await withTransaction(async (client) => {
    for (const firm of firms) {
      await client.query(
        `insert into firms (id, name, email, password_hash, password_hint, mobile, delivery_capacity, role, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, coalesce($9::timestamptz, now()))
         on conflict (id) do update set
           name = excluded.name,
           email = excluded.email,
           password_hash = excluded.password_hash,
           password_hint = excluded.password_hint,
           mobile = excluded.mobile,
           delivery_capacity = excluded.delivery_capacity,
           role = excluded.role`,
        [
          firm.id,
          firm.name,
          (firm.email || '').toLowerCase().trim(),
          firm.password,
          firm.passwordHint || null,
          firm.mobile || null,
          Number(firm.deliveryCapacity) || 0,
          firm.role || 'FIRM',
          firm.createdAt || null,
        ]
      );
    }

    for (const agent of agents) {
      await client.query(
        `insert into agents (id, firm_id, name, email, password_hash, password_hint, mobile, role, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, coalesce($9::timestamptz, now()))
         on conflict (id) do update set
           firm_id = excluded.firm_id,
           name = excluded.name,
           email = excluded.email,
           password_hash = excluded.password_hash,
           password_hint = excluded.password_hint,
           mobile = excluded.mobile,
           role = excluded.role`,
        [
          agent.id,
          agent.firmId,
          agent.name,
          (agent.email || '').toLowerCase().trim(),
          agent.password,
          agent.passwordHint || null,
          agent.mobile || null,
          agent.role || 'AGENT',
          agent.createdAt || null,
        ]
      );
    }

    for (const product of products) {
      await client.query(
        `insert into products (id, name, unit, last_selling_price, ctn_price, created_at, updated_at)
         values ($1, $2, $3, $4, $5, coalesce($6::timestamptz, now()), coalesce($7::timestamptz, now()))
         on conflict (id) do update set
           name = excluded.name,
           unit = excluded.unit,
           last_selling_price = excluded.last_selling_price,
           ctn_price = excluded.ctn_price,
           updated_at = excluded.updated_at`,
        [
          product.id,
          product.name,
          product.unit || '',
          product.lastSellingPrice ?? null,
          product.ctnPrice ?? null,
          product.createdAt || null,
          product.updatedAt || product.createdAt || null,
        ]
      );
    }

    for (const party of parties) {
      await client.query(
        `insert into parties (id, firm_id, name, mobile, address, category, created_by_agent, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, coalesce($8::timestamptz, now()), coalesce($9::timestamptz, now()))
         on conflict (id) do update set
           firm_id = excluded.firm_id,
           name = excluded.name,
           mobile = excluded.mobile,
           address = excluded.address,
           category = excluded.category,
           created_by_agent = excluded.created_by_agent,
           updated_at = excluded.updated_at`,
        [
          party.id,
          party.firmId,
          party.name,
          party.mobile || '',
          party.address || '',
          party.category || 'SALE',
          party.createdByAgent || null,
          party.createdAt || null,
          party.updatedAt || party.createdAt || null,
        ]
      );
    }

    for (const tx of transactions) {
      await client.query(
        `insert into transactions (
          id, firm_id, date, product_id, product_name, party_id, party_name, remark_version, qty, rate, amount,
          remark, delivery_date, po_id, type, status, created_by, agent_name, converted_from, converted_sale_id,
          created_at, updated_at
        ) values (
          $1, $2, $3::date, $4, $5, $6, $7, $8, $9, $10, $11,
          $12, $13::date, $14, $15, $16, $17, $18, $19, $20,
          coalesce($21::timestamptz, now()), coalesce($22::timestamptz, now())
        )
        on conflict (id) do update set
          firm_id = excluded.firm_id,
          date = excluded.date,
          product_id = excluded.product_id,
          product_name = excluded.product_name,
          party_id = excluded.party_id,
          party_name = excluded.party_name,
          remark_version = excluded.remark_version,
          qty = excluded.qty,
          rate = excluded.rate,
          amount = excluded.amount,
          remark = excluded.remark,
          delivery_date = excluded.delivery_date,
          po_id = excluded.po_id,
          type = excluded.type,
          status = excluded.status,
          created_by = excluded.created_by,
          agent_name = excluded.agent_name,
          converted_from = excluded.converted_from,
          converted_sale_id = excluded.converted_sale_id,
          updated_at = excluded.updated_at`,
        [
          tx.id,
          tx.firmId,
          tx.date,
          tx.productId,
          tx.productName,
          tx.partyId || null,
          tx.partyName || null,
          tx.remarkVersion || '',
          Number(tx.qty) || 0,
          Number(tx.rate) || 0,
          Number(tx.amount) || 0,
          tx.remark || '',
          tx.deliveryDate || null,
          tx.poId || null,
          tx.type,
          tx.status || null,
          tx.createdBy,
          tx.agentName || null,
          tx.converted_from || null,
          tx.converted_sale_id || null,
          tx.createdAt || null,
          tx.updatedAt || tx.createdAt || null,
        ]
      );
    }
  });

  console.log(`Migrated ${firms.length} firms, ${agents.length} agents, ${products.length} products, ${parties.length} parties, ${transactions.length} transactions.`);
  process.exit(0);
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
