create extension if not exists pgcrypto;

create table if not exists firms (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  email text not null unique,
  password_hash text not null,
  password_hint text,
  mobile text,
  delivery_capacity numeric(18, 4) not null default 0,
  role text not null default 'FIRM' check (role = 'FIRM'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists agents (
  id text primary key default gen_random_uuid()::text,
  firm_id text not null references firms(id) on delete cascade,
  name text not null,
  email text not null unique,
  password_hash text not null,
  password_hint text,
  mobile text,
  role text not null default 'AGENT' check (role = 'AGENT'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists products (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  unit text not null default '',
  last_selling_price numeric(18, 4),
  ctn_price numeric(18, 4),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists parties (
  id text primary key default gen_random_uuid()::text,
  firm_id text not null references firms(id) on delete cascade,
  name text not null,
  mobile text not null default '',
  address text not null default '',
  category text not null default 'SALE' check (category in ('PURCHASE', 'SALE')),
  created_by_agent text references agents(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists transactions (
  id text primary key default gen_random_uuid()::text,
  firm_id text not null references firms(id) on delete cascade,
  date date not null,
  product_id text,
  product_name text,
  party_id text,
  party_name text,
  remark_version text not null default '',
  qty numeric(18, 4) not null default 0,
  rate numeric(18, 4) not null default 0,
  amount numeric(18, 4) not null default 0,
  total_qty numeric(18, 4) not null default 0,
  remark text not null default '',
  delivery_date date,
  so_id text,
  bill_no text,
  type text not null,
  status text,
  created_by text not null,
  agent_name text,
  converted_from text references transactions(id) on delete set null,
  converted_sale_id text references transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists bill_items (
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

create index if not exists idx_firms_email on firms(email);
create index if not exists idx_agents_email on agents(email);
create index if not exists idx_agents_firm_id on agents(firm_id);
create index if not exists idx_parties_firm_id on parties(firm_id);
create index if not exists idx_transactions_firm_id on transactions(firm_id);
create index if not exists idx_transactions_created_by on transactions(created_by);
create index if not exists idx_transactions_delivery_date on transactions(delivery_date);
create index if not exists idx_transactions_type on transactions(type);
create index if not exists idx_bill_items_transaction_id on bill_items(transaction_id);
create index if not exists idx_bill_items_product_id on bill_items(product_id);
create index if not exists idx_outward_details_firm_id on outward_details(firm_id);
create index if not exists idx_outward_details_bill_id on outward_details(bill_id);

alter table firms enable row level security;
alter table agents enable row level security;
alter table parties enable row level security;
alter table transactions enable row level security;
alter table products enable row level security;
alter table bill_items enable row level security;

drop policy if exists firms_select_own on firms;
create policy firms_select_own on firms
for select using (auth.uid()::text = id);

drop policy if exists agents_select_own on agents;
create policy agents_select_own on agents
for select using (auth.uid()::text = id);

drop policy if exists agents_select_same_firm on agents;
create policy agents_select_same_firm on agents
for select using (
  exists (
    select 1
    from firms
    where firms.id = agents.firm_id
      and firms.id = auth.uid()::text
  )
);

drop policy if exists parties_same_firm_read on parties;
create policy parties_same_firm_read on parties
for select using (
  firm_id = auth.uid()::text
  or exists (
    select 1 from agents
    where agents.id = auth.uid()::text
      and agents.firm_id = parties.firm_id
  )
);

drop policy if exists transactions_same_firm_read on transactions;
create policy transactions_same_firm_read on transactions
for select using (
  firm_id = auth.uid()::text
  or exists (
    select 1 from agents
    where agents.id = auth.uid()::text
      and agents.firm_id = transactions.firm_id
  )
);

drop policy if exists products_global_read on products;
create policy products_global_read on products
for select using (true);

drop policy if exists bill_items_global_read on bill_items;
create policy bill_items_global_read on bill_items
for select using (true);

-- Note:
-- The current app still uses the Express server with its own JWT auth.
-- These RLS policies are for a future direct-Supabase access path where
-- auth.uid() is aligned with firm/agent ids.
