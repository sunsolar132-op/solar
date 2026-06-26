-- Migration: Create Product Qty Adjustments Table
-- Please run this SQL script in your Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS product_qty_adjustments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  adjustment_no SERIAL,
  firm_id TEXT NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('ADD', 'REMOVE')),
  qty NUMERIC(18, 4) NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  agent_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS for security
ALTER TABLE product_qty_adjustments ENABLE ROW LEVEL SECURITY;

-- Select policy: firm owners or agents belonging to the same firm can read
DROP POLICY IF EXISTS product_qty_adjustments_same_firm_read ON product_qty_adjustments;
CREATE POLICY product_qty_adjustments_same_firm_read ON product_qty_adjustments
FOR SELECT USING (
  firm_id = auth.uid()::TEXT
  OR EXISTS (
    SELECT 1 FROM agents
    WHERE agents.id = auth.uid()::TEXT
      AND agents.firm_id = product_qty_adjustments.firm_id
  )
);

-- Write policy: only firm owners can perform write operations (insert/update/delete)
DROP POLICY IF EXISTS product_qty_adjustments_same_firm_write ON product_qty_adjustments;
CREATE POLICY product_qty_adjustments_same_firm_write ON product_qty_adjustments
FOR ALL USING (
  firm_id = auth.uid()::TEXT
);

-- Indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_product_qty_adjustments_firm_id ON product_qty_adjustments(firm_id);
CREATE INDEX IF NOT EXISTS idx_product_qty_adjustments_product_id ON product_qty_adjustments(product_id);
CREATE INDEX IF NOT EXISTS idx_product_qty_adjustments_date ON product_qty_adjustments(date);
