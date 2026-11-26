set search_path = p360, public, extensions;

-- ---------- Catálogo de produtos ----------
create table if not exists products (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  name          text not null,
  description   text,
  kind          deal_kind not null default 'one_off',   -- retainer = mensal
  price         numeric(14,2) not null default 0,       -- sem IVA
  duration_months int not null default 1,               -- só avenças
  active        boolean not null default true,
  position      int not null default 0,
  created_at    timestamptz not null default now()
);
alter table products enable row level security;
drop policy if exists products_read on products;
drop policy if exists products_write on products;
create policy products_read  on products for select using (can_read(org_id, 'crm'));
create policy products_write on products for all using (can_write(org_id, 'crm')) with check (can_write(org_id, 'crm'));

alter table deals
  add column if not exists product_id uuid references products(id) on delete set null,
  add column if not exists quantity numeric(10,2) not null default 1,
  add column if not exists source text;     -- origem da lead (referência, LinkedIn, site…)

-- ---------- Proposta premium ----------
alter table proposals
  add column if not exists context text,        -- o contexto / diagnóstico do cliente
  add column if not exists objectives text,     -- um objetivo por linha
  add column if not exists phases jsonb not null default '[]'::jsonb,  -- [{nome, descricao, duracao}]
  add column if not exists next_steps text,     -- um passo por linha
  add column if not exists show_about boolean not null default true,
  add column if not exists accent text not null default '#0071E3';

alter table organizations
  add column if not exists about text,          -- "Sobre mim / nós"
  add column if not exists testimonials text,   -- um testemunho por parágrafo: "texto — autor"
  add column if not exists signature_name text,
  add column if not exists signature_role text;

-- ---------- Perfil: telefone (WhatsApp) ----------
alter table profiles add column if not exists phone text;

-- ---------- Vista de negócios com produto e origem ----------
drop view if exists v_deals;
create view v_deals with (security_invoker = true) as
select d.*,
       s.name as stage_name, s.position as stage_position,
       coalesce(d.probability, s.probability) as eff_probability,
       case when d.kind = 'retainer' then d.value * d.duration_months else d.value end as total_value,
       round((case when d.kind = 'retainer' then d.value * d.duration_months else d.value end)
             * coalesce(d.probability, s.probability) / 100.0, 2) as weighted_value,
       c.name as company_name,
       p.name as product_name,
       ct.name as contact_name, ct.phone as contact_phone, ct.email as contact_email,
       (d.status = 'open' and d.last_activity_at < now() - interval '10 days') as is_cooling
from deals d
join stages s on s.id = d.stage_id
left join companies c on c.id = d.company_id
left join products p on p.id = d.product_id
left join contacts ct on ct.id = d.contact_id;

grant select, insert, update, delete on all tables in schema p360 to authenticated, service_role;
grant select on v_deals to authenticated, service_role;
