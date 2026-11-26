set search_path = p360, public, extensions;

-- =====================================================================
-- 1) COBRANÇAS: valores a receber (avenças mês a mês e serviços pontuais ganhos)
-- =====================================================================
create table if not exists receivables (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  scope          fin_scope not null default 'business',
  owner_id       uuid references auth.users(id) default auth.uid(),
  deal_id        uuid references deals(id) on delete set null,
  recurring_id   uuid references recurring(id) on delete set null,
  description    text not null,
  amount         numeric(14,2) not null,          -- valor esperado a receber (com IVA quando aplicável)
  due_date       date not null,
  received_at    date,
  transaction_id uuid references transactions(id) on delete set null,
  status         text not null default 'open' check (status in ('open', 'received', 'cancelled')),
  created_at     timestamptz not null default now(),
  unique (recurring_id, due_date)
);
alter table receivables enable row level security;
drop policy if exists receivables_rw on receivables;
drop policy if exists receivables_read on receivables;
create policy receivables_rw on receivables for all using (
  (scope = 'personal' and owner_id = auth.uid() and is_member(org_id)) or (scope = 'business' and can_write(org_id, 'finance')))
  with check ((scope = 'personal' and owner_id = auth.uid() and is_member(org_id)) or (scope = 'business' and can_write(org_id, 'finance')));
create policy receivables_read on receivables for select using (scope = 'business' and can_read(org_id, 'finance'));

-- Taxa de IVA das definições da organização (para o valor a receber)
create or replace function org_vat(p_org uuid) returns numeric
language sql stable security definer set search_path = p360, public as $$
  select coalesce((settings->'tax'->>'iva')::numeric, 23) from organizations where id = p_org;
$$;

-- Gera os valores a receber das receitas recorrentes até ao mês atual e associa recebimentos do banco
create or replace function sync_receivables(p_org uuid) returns void
language plpgsql security definer set search_path = p360, public as $$
declare r record; rv record; m date; v_vat numeric; v_end date; v_tid uuid; v_tdate date;
begin
  if not (can_read(p_org, 'finance') or is_member(p_org)) then raise exception 'Sem acesso'; end if;
  v_vat := org_vat(p_org);
  for r in select * from recurring where org_id = p_org and active and amount > 0 loop
    m := date_trunc('month', r.starts_on)::date;
    v_end := least(coalesce(r.ends_on, current_date), current_date + 31);
    while m <= v_end loop
      insert into receivables (org_id, scope, owner_id, deal_id, recurring_id, description, amount, due_date)
      values (p_org, r.scope, r.owner_id, r.deal_id, r.id, r.description,
              round(r.amount * case when r.scope = 'business' then (1 + v_vat / 100) else 1 end, 2),
              (m + make_interval(days => least(r.day_of_month, extract(day from (m + interval '1 month - 1 day'))::int) - 1))::date)
      on conflict (recurring_id, due_date) do nothing;
      m := (m + interval '1 month')::date;
    end loop;
  end loop;
  -- Associação automática: entrada não usada, valor ±1 €, entre 10 dias antes e 60 depois do vencimento
  for rv in select * from receivables where org_id = p_org and status = 'open' order by due_date loop
    select t.id, t.date into v_tid, v_tdate from transactions t join accounts a on a.id = t.account_id
      where t.org_id = p_org and t.amount > 0 and abs(t.amount - rv.amount) <= 1 and a.scope = rv.scope
        and t.date between rv.due_date - 10 and rv.due_date + 60
        and not exists (select 1 from receivables x where x.transaction_id = t.id)
      order by abs(t.date - rv.due_date) limit 1;
    if v_tid is not null then
      update receivables set status = 'received', received_at = v_tdate, transaction_id = v_tid where id = rv.id;
    end if;
  end loop;
end $$;

-- =====================================================================
-- 8) FIM DE PROGRAMA: semanas de entrega por produto e data de fim do negócio
-- =====================================================================
alter table products add column if not exists delivery_weeks int not null default 0;
alter table deals add column if not exists delivery_end date;

create or replace function deals_after_won() returns trigger
language plpgsql security definer set search_path = p360, public as $$
declare v_cat uuid; v_weeks int; v_end date; v_owner uuid; v_vat numeric;
begin
  if new.status = 'won' and (tg_op = 'INSERT' or old.status is distinct from 'won') then
    v_owner := coalesce(new.owner_id, auth.uid());
    if new.kind = 'retainer' then
      select id into v_cat from categories where org_id = new.org_id and scope = 'business' and name = 'Avenças' limit 1;
      insert into recurring (org_id, scope, owner_id, category_id, deal_id, description, amount, starts_on, ends_on)
      values (new.org_id, 'business', v_owner, v_cat, new.id, 'Avença: ' || new.title,
              new.value, current_date, current_date + make_interval(months => new.duration_months));
      v_end := current_date + make_interval(months => new.duration_months);
    else
      -- serviço pontual: valor a receber (com IVA) a 15 dias
      v_vat := org_vat(new.org_id);
      insert into receivables (org_id, scope, owner_id, deal_id, description, amount, due_date)
      values (new.org_id, 'business', v_owner, new.id, new.title, round(new.value * (1 + v_vat / 100), 2), current_date + 15);
      select delivery_weeks into v_weeks from products where id = new.product_id;
      if coalesce(v_weeks, 0) > 0 then v_end := current_date + v_weeks * 7; end if;
    end if;
    update deals set delivery_end = v_end where id = new.id and v_end is not null;
    insert into tasks (org_id, owner_id, title, due_date, deal_id, module)
    values (new.org_id, v_owner, 'Onboarding: ' || new.title, current_date + 3, new.id, 'crm');
    if v_end is not null then
      insert into tasks (org_id, owner_id, title, due_date, deal_id, module) values
        (new.org_id, v_owner, 'Propor continuidade: ' || new.title, v_end - 14, new.id, 'crm'),
        (new.org_id, v_owner, 'Pedir testemunho e recomendações: ' || new.title, v_end, new.id, 'crm');
    else
      insert into tasks (org_id, owner_id, title, due_date, deal_id, module)
      values (new.org_id, v_owner, 'Pedir testemunho e recomendação: ' || new.title, current_date + 30, new.id, 'crm');
    end if;
  end if;
  return null;
end $$;

-- =====================================================================
-- 3) SUBSCRIÇÕES: decisões do utilizador sobre subscrições detetadas
-- =====================================================================
create table if not exists subscription_marks (
  org_id   uuid not null references organizations(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  pattern  text not null,
  status   text not null check (status in ('keep', 'cancel', 'ignore')),
  updated_at timestamptz not null default now(),
  primary key (org_id, owner_id, pattern)
);
alter table subscription_marks enable row level security;
drop policy if exists submarks_own on subscription_marks;
create policy submarks_own on subscription_marks for all using (owner_id = auth.uid() and is_member(org_id)) with check (owner_id = auth.uid() and is_member(org_id));

-- =====================================================================
-- 6) REVISÃO MENSAL DE VIDA
-- =====================================================================
create table if not exists life_reviews (
  org_id     uuid not null references organizations(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  month      date not null,
  scores     jsonb not null default '{}'::jsonb,   -- {"Saúde": 7, ...}
  wins       text,
  lessons    text,
  focus_area text,
  focus      text,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id, month)
);
alter table life_reviews enable row level security;
drop policy if exists life_own on life_reviews;
create policy life_own on life_reviews for all using (user_id = auth.uid() and is_member(org_id)) with check (user_id = auth.uid() and is_member(org_id));

-- =====================================================================
-- 7) FORMULÁRIO PÚBLICO DE CONTACTO
-- =====================================================================
alter table organizations
  add column if not exists public_slug text unique,
  add column if not exists lead_form jsonb not null default '{}'::jsonb;  -- {enabled, title, intro, products: bool}

create or replace function public_form_info(p_slug text) returns jsonb
language sql stable security definer set search_path = p360, public as $$
  select jsonb_build_object('name', coalesce(o.legal_name, o.name), 'title', o.lead_form->>'title', 'intro', o.lead_form->>'intro',
    'products', case when coalesce((o.lead_form->>'products')::boolean, true)
      then (select coalesce(jsonb_agg(p.name order by p.position), '[]'::jsonb) from products p where p.org_id = o.id and p.active) else '[]'::jsonb end)
  from organizations o where o.public_slug = lower(p_slug) and coalesce((o.lead_form->>'enabled')::boolean, false);
$$;

create or replace function public_lead(p_slug text, p_name text, p_email text, p_phone text, p_message text, p_interest text, p_source text, p_honeypot text)
returns text
language plpgsql security definer set search_path = p360, public as $$
declare o organizations%rowtype; v_owner uuid; v_pipe uuid; v_stage uuid; v_contact uuid; v_deal uuid; v_prod uuid; v_recent int;
begin
  if coalesce(p_honeypot, '') <> '' then return 'ok'; end if;                       -- robôs
  if coalesce(trim(p_name), '') = '' or (coalesce(trim(p_email), '') = '' and coalesce(trim(p_phone), '') = '') then
    raise exception 'Indica o nome e um email ou telemóvel';
  end if;
  select * into o from organizations where public_slug = lower(p_slug) and coalesce((lead_form->>'enabled')::boolean, false);
  if not found then raise exception 'Formulário indisponível'; end if;
  select count(*) into v_recent from contacts where org_id = o.id and source like 'Formulário%' and created_at > now() - interval '1 hour';
  if v_recent >= 20 then raise exception 'Demasiados pedidos. Tenta mais tarde.'; end if;
  v_owner := o.created_by;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  insert into contacts (org_id, name, email, phone, source, notes)
  values (o.id, left(trim(p_name), 120), nullif(left(trim(p_email), 200), ''), nullif(left(trim(p_phone), 40), ''),
          'Formulário' || coalesce(' · ' || nullif(left(trim(p_source), 60), ''), ''), nullif(left(p_message, 4000), ''))
  returning id into v_contact;
  select id into v_prod from products where org_id = o.id and active and name = p_interest limit 1;
  select id into v_pipe from pipelines where org_id = o.id order by position limit 1;
  select id into v_stage from stages where pipeline_id = v_pipe and not is_won and not is_lost order by position limit 1;
  insert into deals (org_id, pipeline_id, stage_id, contact_id, owner_id, title, kind, value, product_id, source)
  select o.id, v_pipe, v_stage, v_contact, v_owner, coalesce(p.name, 'Pedido de contacto') || ' — ' || left(trim(p_name), 80),
         coalesce(p.kind, 'one_off'), coalesce(p.price, 0), p.id, 'Formulário'
  from (select 1) x left join products p on p.id = v_prod
  returning id into v_deal;
  if coalesce(trim(p_message), '') <> '' then
    insert into activities (org_id, deal_id, contact_id, type, summary, created_by)
    values (o.id, v_deal, v_contact, 'note', 'Mensagem do formulário: ' || left(p_message, 4000), v_owner);
  end if;
  insert into tasks (org_id, owner_id, title, due_date, deal_id, module)
  values (o.id, v_owner, 'Responder a novo contacto: ' || left(trim(p_name), 80), current_date, v_deal, 'crm');
  return 'ok';
end $$;

-- Permissões (as funções públicas são chamadas sem sessão)
grant select, insert, update, delete on receivables, subscription_marks, life_reviews to authenticated, service_role;
grant execute on function sync_receivables(uuid), org_vat(uuid), deals_after_won() to authenticated, service_role;
grant execute on function public_form_info(text) to anon, authenticated;
grant execute on function public_lead(text, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function mcp_call(text, text, jsonb) to anon;
-- Funções internas não ficam acessíveis sem sessão
revoke execute on function sync_receivables(uuid), org_vat(uuid) from anon, public;
