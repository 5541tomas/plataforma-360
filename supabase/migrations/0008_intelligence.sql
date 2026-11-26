set search_path = p360, public, extensions;

-- Definições por organização (motor da meta, impostos, capacidade)
alter table organizations add column if not exists settings jsonb not null default '{}'::jsonb;

-- Horas de entrega por unidade de produto (capacidade e rentabilidade)
alter table products add column if not exists hours_per_unit numeric(8,2) not null default 0;

-- Quem recomendou o cliente (motor de recomendações)
alter table deals add column if not exists referred_by uuid references contacts(id) on delete set null;

-- Revisões semanais
create table if not exists weekly_reviews (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  week_start  date not null,
  data        jsonb not null default '{}'::jsonb,
  ai_text     text,
  notes       text,
  created_at  timestamptz not null default now(),
  unique (org_id, user_id, week_start)
);
alter table weekly_reviews enable row level security;
drop policy if exists reviews_own on weekly_reviews;
create policy reviews_own on weekly_reviews for all using (user_id = auth.uid() and is_member(org_id)) with check (user_id = auth.uid() and is_member(org_id));

-- Tokens pessoais para a ligação ao Claude (guardamos só o hash)
create table if not exists api_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade default auth.uid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  name         text not null default 'Claude',
  token_hash   text not null unique,
  last_used_at timestamptz,
  created_at   timestamptz not null default now()
);
alter table api_tokens enable row level security;
drop policy if exists tokens_own on api_tokens;
create policy tokens_own on api_tokens for all using (user_id = auth.uid() and is_member(org_id)) with check (user_id = auth.uid() and is_member(org_id));

-- Negócio ganho: além do onboarding, agenda pedido de testemunho/recomendação a 30 dias
create or replace function deals_on_stage_change() returns trigger
language plpgsql security definer set search_path = p360, public as $$
declare
  v_stage stages%rowtype; v_cat uuid;
begin
  select * into v_stage from stages where id = new.stage_id;
  if v_stage.is_won then
    new.status := 'won';
    new.won_at := coalesce(new.won_at, now());
  elsif v_stage.is_lost then
    new.status := 'lost';
  else
    new.status := 'open';
    new.won_at := null;
  end if;

  if new.status = 'won' and (tg_op = 'INSERT' or old.status is distinct from 'won') then
    if new.kind = 'retainer' then
      select id into v_cat from categories where org_id = new.org_id and scope = 'business' and name = 'Avenças' limit 1;
      insert into recurring (org_id, scope, owner_id, category_id, deal_id, description, amount, starts_on, ends_on)
      values (new.org_id, 'business', coalesce(new.owner_id, auth.uid()), v_cat, new.id, 'Avença: ' || new.title,
              new.value, current_date, current_date + make_interval(months => new.duration_months));
    end if;
    insert into tasks (org_id, owner_id, title, due_date, deal_id, module)
    values (new.org_id, coalesce(new.owner_id, auth.uid()), 'Onboarding: ' || new.title, current_date + 3, new.id, 'crm'),
           (new.org_id, coalesce(new.owner_id, auth.uid()), 'Pedir testemunho e recomendação: ' || new.title, current_date + 30, new.id, 'crm');
  end if;
  return new;
end $$;

drop view if exists v_deals;
create view v_deals with (security_invoker = true) as
select d.*,
       s.name as stage_name, s.position as stage_position,
       coalesce(d.probability, s.probability) as eff_probability,
       case when d.kind = 'retainer' then d.value * d.duration_months else d.value end as total_value,
       round((case when d.kind = 'retainer' then d.value * d.duration_months else d.value end)
             * coalesce(d.probability, s.probability) / 100.0, 2) as weighted_value,
       c.name as company_name,
       p.name as product_name, p.hours_per_unit as product_hours,
       ct.name as contact_name, ct.phone as contact_phone, ct.email as contact_email,
       rb.name as referred_by_name,
       (d.status = 'open' and d.last_activity_at < now() - interval '10 days') as is_cooling
from deals d
join stages s on s.id = d.stage_id
left join companies c on c.id = d.company_id
left join products p on p.id = d.product_id
left join contacts ct on ct.id = d.contact_id
left join contacts rb on rb.id = d.referred_by;

grant select, insert, update, delete on all tables in schema p360 to authenticated, service_role;
grant select on v_deals to authenticated, service_role;
grant execute on all functions in schema p360 to authenticated, service_role;
revoke execute on all functions in schema p360 from anon, public;
