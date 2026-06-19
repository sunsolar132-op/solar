const toIsoString = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
};

const toNumberOrZero = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function mapFirm(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    password: row.password_hash,
    passwordHint: row.password_hint,
    mobile: row.mobile,
    deliveryCapacity: toNumberOrZero(row.delivery_capacity),
    role: row.role,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapAgent(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    password: row.password_hash,
    passwordHint: row.password_hint,
    mobile: row.mobile,
    firmId: row.firm_id,
    role: row.role,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapParty(row) {
  return {
    id: row.id,
    name: row.name,
    mobile: row.mobile,
    gstNumber: row.gst_number,
    address: row.address,
    category: row.category,
    firmId: row.firm_id,
    createdByAgent: row.created_by_agent,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapProduct(row) {
  return {
    id: row.id,
    name: row.name,
    unit: row.unit,
    alternateUnit: row.alternate_unit || null,
    conversionFactor: row.conversion_factor == null ? 1.0 : Number(row.conversion_factor),
    lastSellingPrice: row.last_selling_price == null ? null : Number(row.last_selling_price),
    ctnPrice: row.ctn_price == null ? null : Number(row.ctn_price),
    openingStockQty: row.opening_stock_qty == null ? 0 : Number(row.opening_stock_qty),
    isActive: row.is_active == null ? true : Boolean(row.is_active),
    // isReferenced: true means this product is used in transactions — backward-compat: defaults to false
    isReferenced: row.is_referenced != null ? Boolean(row.is_referenced) : false,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapBillItem(row) {
  return {
    id: row.id,
    transactionId: row.transaction_id,
    productId: row.product_id,
    productName: row.product_name,
    qty: row.qty == null ? 0 : Number(row.qty),
    rate: row.rate == null ? 0 : Number(row.rate),
    amount: row.amount == null ? 0 : Number(row.amount),
    remark: row.remark,
    qtyEntered: row.qty_entered == null ? null : Number(row.qty_entered),
    unitUsed: row.unit_used || null,
    qtyInStandardUnit: row.qty_in_standard_unit == null ? null : Number(row.qty_in_standard_unit),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapTransaction(row) {
  return {
    id: row.id,
    firmId: row.firm_id,
    date: row.date,
    partyId: row.party_id,
    partyName: row.party_name,
    remarkVersion: row.remark_version,
    totalQty: row.total_qty == null ? 0 : Number(row.total_qty),
    amount: row.amount == null ? 0 : Number(row.amount),
    remark: row.remark,
    deliveryDate: row.delivery_date,
    soId: row.so_id,
    poId: row.so_id, // Alias for backward compatibility if any
    billNo: row.bill_no,
    type: row.type,
    status: row.status,
    partyGst: row.party_gst || null,
    partyMobile: row.party_mobile || null,
    createdBy: row.created_by,
    agentName: row.agent_name,
    converted_from: row.converted_from,
    converted_sale_id: row.converted_sale_id,
    deliveryStatus: row.delivery_status || 'Pending',
    completedAt: toIsoString(row.completed_at),
    qtyEntered: row.qty_entered == null ? null : Number(row.qty_entered),
    unitUsed: row.unit_used || null,
    qtyInStandardUnit: row.qty_in_standard_unit == null ? null : Number(row.qty_in_standard_unit),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    items: row.items ? row.items.map(mapBillItem) : [],
  };
}

function mapAdmin(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    password: row.password,
    role: row.role,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

module.exports = {
  mapFirm,
  mapAgent,
  mapParty,
  mapProduct,
  mapTransaction,
  mapBillItem,
  mapAdmin,
};
