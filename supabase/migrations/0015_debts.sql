set search_path = p360, public, extensions;

-- =====================================================================
-- Dívidas: deixam de ser contas com saldo negativo.
-- Cada dívida tem uma categoria de despesa própria; tudo o que for pago
-- nessa categoria (importado ou registado) abate ao valor em dívida.
-- A prestação entra nos recorrentes para previsões e cenários.
-- =====================================================================
create table if not exists debts (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  owner_id        uuid not null references auth.users(id) default auth.uid(),
  scope           fin_scope not null default 'personal',
  kind            text not null default 'loan' check (kind in ('loan', 'credit_card', 'other')),
  name            text not null,
  lender          text,
  balance_start   numeric(14,2) not null check (balance_start >= 0), -- valor em dívida na data de início
  start_date      date not null default current_date,
  monthly_payment numeric(14,2) check (monthly_payment > 0),
  end_date        date,
  day_of_month    int not null default 1 check (day_of_month between 1 and 31),
  account_id      uuid references accounts(id) on delete set null,    -- conta de onde sai a prestação
  category_id     uuid references categories(id) on delete set null,
  recurring_id    uuid references recurring(id) on delete set null,
  notes           text,
  archived        boolean not null default false,
  created_at      timestamptz not null default now()
);
alter table debts enable row level security;
drop policy if exists debts_rw on debts;
drop policy if exists debts_read on debts;
create policy debts_rw on debts for all using (
  (scope = 'personal' and owner_id = auth.uid() and is_member(org_id)) or (scope = 'business' and can_write(org_id, 'finance')))
  with check ((scope = 'personal' and owner_id = auth.uid() and is_member(org_id)) or (scope = 'business' and can_write(org_id, 'finance')));
create policy debts_read on debts for select using (scope = 'business' and can_read(org_id, 'finance'));

-- Categoria e recorrente sincronizados com a dívida
create or replace function debts_sync() returns trigger
language plpgsql security definer set search_path = p360, public as $$
declare v_cat uuid; v_rec uuid; v_name text;
begin
  if pg_trigger_depth() > 1 then return null; end if;
  v_name := case new.kind when 'credit_card' then 'Cartão: ' else 'Crédito: ' end || new.name;
  v_cat := new.category_id;
  if v_cat is null then
    insert into categories (org_id, scope, kind, name) values (new.org_id, new.scope, 'expense', v_name)
      on conflict (org_id, scope, kind, name) do nothing;
    select id into v_cat from categories where org_id = new.org_id and scope = new.scope and kind = 'expense' and name = v_name;
  end if;
  v_rec := new.recurring_id;
  if new.monthly_payment is not null and not new.archived then
    if v_rec is null then
      insert into recurring (org_id, scope, owner_id, account_id, category_id, description, amount, day_of_month, starts_on, ends_on)
      values (new.org_id, new.scope, new.owner_id, new.account_id, v_cat, 'Prestação: ' || new.name, -new.monthly_payment, new.day_of_month, new.start_date, new.end_date)
      returning id into v_rec;
    else
      update recurring set amount = -new.monthly_payment, day_of_month = new.day_of_month, ends_on = new.end_date,
        account_id = new.account_id, category_id = v_cat, description = 'Prestação: ' || new.name, active = true where id = v_rec;
    end if;
  elsif v_rec is not null then
    update recurring set active = false where id = v_rec;
  end if;
  update debts set category_id = v_cat, recurring_id = v_rec where id = new.id;
  return null;
end $$;
drop trigger if exists debts_sync_trg on debts;
create trigger debts_sync_trg after insert or update on debts for each row execute function debts_sync();

-- Estado de cada dívida (respeita RLS de quem consulta)
create or replace view v_debts with (security_invoker = true) as
with paid as (
  select d.id, coalesce((select -sum(t.amount) from transactions t
      where t.category_id = d.category_id and t.amount < 0 and t.date >= d.start_date), 0) as paid
  from debts d
)
select d.*, p.paid,
  greatest(0, d.balance_start - p.paid) as remaining,
  case when d.balance_start > 0 then least(1, p.paid / d.balance_start) else 1 end as progress,
  case when d.monthly_payment > 0 then ceil(greatest(0, d.balance_start - p.paid) / d.monthly_payment)::int end as months_left,
  case when d.monthly_payment > 0 and greatest(0, d.balance_start - p.paid) > 0
    then (date_trunc('month', current_date) + make_interval(months => ceil(greatest(0, d.balance_start - p.paid) / d.monthly_payment)::int - 1))::date end as projected_end,
  -- o que devia estar pago hoje segundo o plano (prestações vencidas desde o início)
  case when d.monthly_payment > 0 then least(d.balance_start, d.monthly_payment * greatest(0,
      (extract(year from age(current_date, d.start_date)) * 12 + extract(month from age(current_date, d.start_date)))::int
      + case when extract(day from current_date) >= d.day_of_month then 1 else 0 end
      - case when extract(day from d.start_date) > d.day_of_month then 1 else 0 end)) end as expected_paid,
  exists (select 1 from transactions t where t.category_id = d.category_id and t.amount < 0
          and date_trunc('month', t.date) = date_trunc('month', current_date)) as paid_this_month
from debts d join paid p on p.id = d.id;

grant select, insert, update, delete on debts to authenticated, service_role;
grant select on v_debts to authenticated, service_role;
grant execute on function debts_sync() to authenticated, service_role;
