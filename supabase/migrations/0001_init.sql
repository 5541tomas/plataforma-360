-- =====================================================================
-- Plataforma 360 — esquema inicial
-- Multi-organização (SaaS), permissões por módulo, finanças pessoais
-- privadas por utilizador, objetivos (OKR + tarefas + hábitos) e CRM.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- Tipos ----------
create type access_level as enum ('none', 'read', 'write');
create type member_role  as enum ('owner', 'admin', 'member');
create type app_module   as enum ('goals', 'finance', 'crm');
create type fin_scope    as enum ('personal', 'business');
create type account_type as enum ('checking', 'savings', 'investment', 'credit_card', 'loan', 'cash');
create type cat_kind     as enum ('income', 'expense', 'transfer');
create type goal_horizon as enum ('vision', 'year', 'quarter', 'month');
create type goal_status  as enum ('active', 'done', 'paused', 'dropped');
create type kr_source    as enum ('manual', 'finance_income', 'finance_savings', 'crm_mrr', 'crm_won_value', 'crm_won_count', 'habit');
create type deal_kind    as enum ('retainer', 'one_off');
create type deal_status  as enum ('open', 'won', 'lost');
create type activity_type as enum ('note', 'call', 'email', 'meeting', 'task');
create type proposal_status as enum ('draft', 'sent', 'accepted', 'rejected');

-- ---------- Núcleo: perfis, organizações, membros ----------
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

create table organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  currency    text not null default 'EUR',
  country     text not null default 'PT',
  plan        text not null default 'free',
  created_by  uuid not null references auth.users(id),
  created_at  timestamptz not null default now()
);

create table members (
  org_id       uuid not null references organizations(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         member_role not null default 'member',
  perm_goals   access_level not null default 'write',
  perm_finance access_level not null default 'none',
  perm_crm     access_level not null default 'write',
  created_at   timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index on members(user_id);

create table invitations (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  email        text not null,
  role         member_role not null default 'member',
  perm_goals   access_level not null default 'write',
  perm_finance access_level not null default 'none',
  perm_crm     access_level not null default 'write',
  token        text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  invited_by   uuid not null references auth.users(id),
  accepted_at  timestamptz,
  created_at   timestamptz not null default now()
);

-- ---------- Funções de permissão (security definer evita recursão em RLS) ----------
create or replace function is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where org_id = p_org and user_id = auth.uid());
$$;

create or replace function is_org_admin(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where org_id = p_org and user_id = auth.uid() and role in ('owner','admin'));
$$;

create or replace function module_access(p_org uuid, p_module app_module) returns access_level
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case p_module
      when 'goals'   then perm_goals
      when 'finance' then perm_finance
      when 'crm'     then perm_crm
    end
    from members where org_id = p_org and user_id = auth.uid()
  ), 'none'::access_level);
$$;

create or replace function can_read(p_org uuid, p_module app_module) returns boolean
language sql stable as $$ select module_access(p_org, p_module) in ('read','write'); $$;

create or replace function can_write(p_org uuid, p_module app_module) returns boolean
language sql stable as $$ select module_access(p_org, p_module) = 'write'; $$;

-- ---------- Objetivos ----------
create table goals (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  owner_id      uuid not null references auth.users(id) default auth.uid(),
  parent_id     uuid references goals(id) on delete set null,
  is_private    boolean not null default true,   -- objetivos pessoais só o dono vê
  area          text not null default 'Negócio', -- Negócio, Finanças, Saúde, Relações, Aprendizagem, Lazer
  horizon       goal_horizon not null default 'year',
  period_start  date not null default date_trunc('year', now())::date,
  title         text not null,
  description   text,
  status        goal_status not null default 'active',
  created_at    timestamptz not null default now()
);
create index on goals(org_id, horizon, period_start);

create table key_results (
  id             uuid primary key default gen_random_uuid(),
  goal_id        uuid not null references goals(id) on delete cascade,
  org_id         uuid not null references organizations(id) on delete cascade,
  label          text not null,
  unit           text not null default '',          -- '€', '%', '', ...
  start_value    numeric not null default 0,
  target_value   numeric not null,
  current_value  numeric not null default 0,         -- usado quando source = manual
  source         kr_source not null default 'manual',
  source_config  jsonb not null default '{}'::jsonb, -- ex.: {"from":"2026-01-01","category_id":"..."}
  position       int not null default 0,
  created_at     timestamptz not null default now()
);

create table habits (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  owner_id        uuid not null references auth.users(id) default auth.uid(),
  key_result_id   uuid references key_results(id) on delete set null,
  name            text not null,
  target_per_week int not null default 7 check (target_per_week between 1 and 7),
  archived        boolean not null default false,
  created_at      timestamptz not null default now()
);

create table habit_logs (
  habit_id  uuid not null references habits(id) on delete cascade,
  day       date not null default current_date,
  primary key (habit_id, day)
);

-- ---------- Finanças ----------
create table accounts (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id) on delete cascade,
  scope            fin_scope not null,
  owner_id         uuid not null references auth.users(id) default auth.uid(),
  name             text not null,
  bank             text,                   -- Santander, ActivoBank, ABANCA...
  type             account_type not null default 'checking',
  opening_balance  numeric(14,2) not null default 0,
  currency         text not null default 'EUR',
  archived         boolean not null default false,
  created_at       timestamptz not null default now()
);

-- Contas pessoais: só o dono. Contas da empresa: permissão de finanças.
create or replace function account_readable(p_account uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from accounts a where a.id = p_account and (
      (a.scope = 'personal' and a.owner_id = auth.uid() and is_member(a.org_id)) or
      (a.scope = 'business' and can_read(a.org_id, 'finance'))
    ));
$$;
create or replace function account_writable(p_account uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from accounts a where a.id = p_account and (
      (a.scope = 'personal' and a.owner_id = auth.uid() and is_member(a.org_id)) or
      (a.scope = 'business' and can_write(a.org_id, 'finance'))
    ));
$$;

create table categories (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  scope      fin_scope not null,
  kind       cat_kind not null,
  name       text not null,
  color      text,
  created_at timestamptz not null default now(),
  unique (org_id, scope, kind, name)
);

create table transactions (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  account_id      uuid not null references accounts(id) on delete cascade,
  date            date not null default current_date,
  description     text not null,
  amount          numeric(14,2) not null,   -- positivo = entrada, negativo = saída
  category_id     uuid references categories(id) on delete set null,
  deal_id         uuid,                     -- FK adicionada depois de deals
  is_transfer     boolean not null default false,
  ai_categorized  boolean not null default false,
  external_id     text,                     -- id do banco / linha do extrato (dedupe)
  notes           text,
  created_at      timestamptz not null default now(),
  unique (account_id, external_id)
);
create index on transactions(org_id, date desc);

create table budgets (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  scope        fin_scope not null,
  owner_id     uuid not null references auth.users(id) default auth.uid(),
  category_id  uuid not null references categories(id) on delete cascade,
  month        date not null,                -- primeiro dia do mês
  amount       numeric(14,2) not null,
  unique (category_id, month, owner_id)
);

-- Receitas / despesas recorrentes (avenças, rendas, subscrições)
create table recurring (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  scope        fin_scope not null,
  owner_id     uuid not null references auth.users(id) default auth.uid(),
  account_id   uuid references accounts(id) on delete set null,
  category_id  uuid references categories(id) on delete set null,
  deal_id      uuid,
  description  text not null,
  amount       numeric(14,2) not null,       -- +/- como nas transações
  day_of_month int not null default 1 check (day_of_month between 1 and 31),
  starts_on    date not null default current_date,
  ends_on      date,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- Saldos de investimentos / ativos (snapshots manuais ou importados)
create table account_snapshots (
  account_id  uuid not null references accounts(id) on delete cascade,
  date        date not null default current_date,
  balance     numeric(14,2) not null,
  primary key (account_id, date)
);

-- ---------- CRM ----------
create table companies (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  name       text not null,
  nif        text,
  website    text,
  industry   text,
  notes      text,
  created_at timestamptz not null default now()
);

create table contacts (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  company_id  uuid references companies(id) on delete set null,
  name        text not null,
  email       text,
  phone       text,
  role        text,
  source      text,               -- origem da lead: referência, LinkedIn, site...
  notes       text,
  created_at  timestamptz not null default now()
);
create index on contacts(org_id, email);

create table pipelines (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  name       text not null,
  position   int not null default 0,
  created_at timestamptz not null default now()
);

create table stages (
  id           uuid primary key default gen_random_uuid(),
  pipeline_id  uuid not null references pipelines(id) on delete cascade,
  org_id       uuid not null references organizations(id) on delete cascade,
  name         text not null,
  position     int not null default 0,
  probability  int not null default 10 check (probability between 0 and 100),
  is_won       boolean not null default false,
  is_lost      boolean not null default false
);

create table deals (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id) on delete cascade,
  pipeline_id      uuid not null references pipelines(id) on delete cascade,
  stage_id         uuid not null references stages(id),
  company_id       uuid references companies(id) on delete set null,
  contact_id       uuid references contacts(id) on delete set null,
  owner_id         uuid references auth.users(id) default auth.uid(),
  title            text not null,
  kind             deal_kind not null default 'one_off',
  value            numeric(14,2) not null default 0,  -- pontual: total; avença: valor mensal
  duration_months  int not null default 12,           -- só para avenças
  probability      int check (probability between 0 and 100), -- null = usa a da etapa
  expected_close   date,
  status           deal_status not null default 'open',
  won_at           timestamptz,
  lost_reason      text,
  last_activity_at timestamptz not null default now(),
  created_at       timestamptz not null default now()
);
create index on deals(org_id, status);

alter table transactions add constraint transactions_deal_fk foreign key (deal_id) references deals(id) on delete set null;
alter table recurring    add constraint recurring_deal_fk    foreign key (deal_id) references deals(id) on delete set null;

create table activities (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  deal_id      uuid references deals(id) on delete cascade,
  contact_id   uuid references contacts(id) on delete cascade,
  company_id   uuid references companies(id) on delete cascade,
  type         activity_type not null default 'note',
  summary      text not null,
  occurred_at  timestamptz not null default now(),
  due_at       timestamptz,          -- para follow-ups
  done         boolean not null default true,
  external_id  text,                 -- id Gmail / Calendar
  created_by   uuid references auth.users(id) default auth.uid(),
  created_at   timestamptz not null default now()
);

create table proposals (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  deal_id     uuid not null references deals(id) on delete cascade,
  number      text not null,
  items       jsonb not null default '[]'::jsonb, -- [{descricao, qtd, preco}]
  total       numeric(14,2) not null default 0,
  valid_until date,
  status      proposal_status not null default 'draft',
  pdf_path    text,
  created_at  timestamptz not null default now()
);

-- ---------- Tarefas (ligam objetivos, CRM e finanças) ----------
create table tasks (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  owner_id       uuid not null references auth.users(id) default auth.uid(),
  title          text not null,
  due_date       date,
  done           boolean not null default false,
  done_at        timestamptz,
  key_result_id  uuid references key_results(id) on delete set null,
  deal_id        uuid references deals(id) on delete set null,
  module         app_module not null default 'goals',
  created_at     timestamptz not null default now()
);
create index on tasks(org_id, owner_id, done, due_date);

-- =====================================================================
-- RLS
-- =====================================================================
alter table profiles          enable row level security;
alter table organizations     enable row level security;
alter table members           enable row level security;
alter table invitations       enable row level security;
alter table goals             enable row level security;
alter table key_results       enable row level security;
alter table habits            enable row level security;
alter table habit_logs        enable row level security;
alter table accounts          enable row level security;
alter table categories        enable row level security;
alter table transactions      enable row level security;
alter table budgets           enable row level security;
alter table recurring         enable row level security;
alter table account_snapshots enable row level security;
alter table companies         enable row level security;
alter table contacts          enable row level security;
alter table pipelines         enable row level security;
alter table stages            enable row level security;
alter table deals             enable row level security;
alter table activities        enable row level security;
alter table proposals         enable row level security;
alter table tasks             enable row level security;

-- Perfis
create policy profiles_self on profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_same_org on profiles for select using (
  exists (select 1 from members m1 join members m2 on m1.org_id = m2.org_id
          where m1.user_id = auth.uid() and m2.user_id = profiles.id));

-- Organizações e membros
create policy org_select on organizations for select using (is_member(id));
create policy org_update on organizations for update using (is_org_admin(id));
create policy members_select on members for select using (is_member(org_id));
create policy members_admin  on members for all using (is_org_admin(org_id)) with check (is_org_admin(org_id));
create policy invitations_admin on invitations for all using (is_org_admin(org_id)) with check (is_org_admin(org_id));

-- Objetivos
create policy goals_read on goals for select using (
  can_read(org_id, 'goals') and (not is_private or owner_id = auth.uid()));
create policy goals_write on goals for all using (
  can_write(org_id, 'goals') and (not is_private or owner_id = auth.uid()))
  with check (can_write(org_id, 'goals') and (not is_private or owner_id = auth.uid()));

create policy kr_read on key_results for select using (
  exists (select 1 from goals g where g.id = goal_id));  -- herda RLS de goals
create policy kr_write on key_results for all using (
  can_write(org_id, 'goals') and exists (select 1 from goals g where g.id = goal_id))
  with check (can_write(org_id, 'goals') and exists (select 1 from goals g where g.id = goal_id));

create policy habits_own on habits for all using (owner_id = auth.uid() and is_member(org_id))
  with check (owner_id = auth.uid() and is_member(org_id));
create policy habit_logs_own on habit_logs for all using (
  exists (select 1 from habits h where h.id = habit_id and h.owner_id = auth.uid()))
  with check (exists (select 1 from habits h where h.id = habit_id and h.owner_id = auth.uid()));

-- Tarefas: as próprias, ou as do CRM partilhadas com quem tem CRM
create policy tasks_read on tasks for select using (
  is_member(org_id) and (owner_id = auth.uid() or (module = 'crm' and can_read(org_id, 'crm'))));
create policy tasks_write on tasks for all using (
  is_member(org_id) and (owner_id = auth.uid() or (module = 'crm' and can_write(org_id, 'crm'))))
  with check (is_member(org_id) and (owner_id = auth.uid() or (module = 'crm' and can_write(org_id, 'crm'))));

-- Finanças (pessoal = só o dono; empresa = permissão de finanças)
create policy accounts_read on accounts for select using (
  (scope = 'personal' and owner_id = auth.uid() and is_member(org_id)) or
  (scope = 'business' and can_read(org_id, 'finance')));
create policy accounts_write on accounts for all using (
  (scope = 'personal' and owner_id = auth.uid() and is_member(org_id)) or
  (scope = 'business' and can_write(org_id, 'finance')))
  with check (
  (scope = 'personal' and owner_id = auth.uid() and is_member(org_id)) or
  (scope = 'business' and can_write(org_id, 'finance')));

create policy tx_read  on transactions for select using (account_readable(account_id));
create policy tx_write on transactions for all using (account_writable(account_id)) with check (account_writable(account_id));
create policy snap_read  on account_snapshots for select using (account_readable(account_id));
create policy snap_write on account_snapshots for all using (account_writable(account_id)) with check (account_writable(account_id));

create policy cat_read on categories for select using (
  is_member(org_id) and (scope = 'personal' or can_read(org_id, 'finance')));
create policy cat_write on categories for all using (
  (scope = 'personal' and is_member(org_id)) or (scope = 'business' and can_write(org_id, 'finance')))
  with check ((scope = 'personal' and is_member(org_id)) or (scope = 'business' and can_write(org_id, 'finance')));

create policy budgets_rw on budgets for all using (
  (scope = 'personal' and owner_id = auth.uid() and is_member(org_id)) or
  (scope = 'business' and can_write(org_id, 'finance')))
  with check (
  (scope = 'personal' and owner_id = auth.uid() and is_member(org_id)) or
  (scope = 'business' and can_write(org_id, 'finance')));
create policy budgets_read on budgets for select using (scope = 'business' and can_read(org_id, 'finance'));

create policy recurring_rw on recurring for all using (
  (scope = 'personal' and owner_id = auth.uid() and is_member(org_id)) or
  (scope = 'business' and can_write(org_id, 'finance')))
  with check (
  (scope = 'personal' and owner_id = auth.uid() and is_member(org_id)) or
  (scope = 'business' and can_write(org_id, 'finance')));
create policy recurring_read on recurring for select using (scope = 'business' and can_read(org_id, 'finance'));

-- CRM
create policy companies_read  on companies  for select using (can_read(org_id, 'crm'));
create policy companies_write on companies  for all using (can_write(org_id, 'crm')) with check (can_write(org_id, 'crm'));
create policy contacts_read   on contacts   for select using (can_read(org_id, 'crm'));
create policy contacts_write  on contacts   for all using (can_write(org_id, 'crm')) with check (can_write(org_id, 'crm'));
create policy pipelines_read  on pipelines  for select using (can_read(org_id, 'crm'));
create policy pipelines_write on pipelines  for all using (can_write(org_id, 'crm')) with check (can_write(org_id, 'crm'));
create policy stages_read     on stages     for select using (can_read(org_id, 'crm'));
create policy stages_write    on stages     for all using (can_write(org_id, 'crm')) with check (can_write(org_id, 'crm'));
create policy deals_read      on deals      for select using (can_read(org_id, 'crm'));
create policy deals_write     on deals      for all using (can_write(org_id, 'crm')) with check (can_write(org_id, 'crm'));
create policy activities_read on activities for select using (can_read(org_id, 'crm'));
create policy activities_write on activities for all using (can_write(org_id, 'crm')) with check (can_write(org_id, 'crm'));
create policy proposals_read  on proposals  for select using (can_read(org_id, 'crm'));
create policy proposals_write on proposals  for all using (can_write(org_id, 'crm')) with check (can_write(org_id, 'crm'));

-- =====================================================================
-- Automação
-- =====================================================================

-- Perfil automático ao registar
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Criar organização com dados iniciais (dono com acesso total, pipeline e categorias)
create or replace function create_organization(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid; v_pipe uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into organizations (name, created_by) values (p_name, auth.uid()) returning id into v_org;
  insert into members (org_id, user_id, role, perm_goals, perm_finance, perm_crm)
    values (v_org, auth.uid(), 'owner', 'write', 'write', 'write');

  insert into pipelines (org_id, name, position) values (v_org, 'Consultoria', 0) returning id into v_pipe;
  insert into stages (pipeline_id, org_id, name, position, probability, is_won, is_lost) values
    (v_pipe, v_org, 'Lead', 0, 10, false, false),
    (v_pipe, v_org, 'Qualificação', 1, 30, false, false),
    (v_pipe, v_org, 'Proposta', 2, 60, false, false),
    (v_pipe, v_org, 'Negociação', 3, 75, false, false),
    (v_pipe, v_org, 'Ganho', 4, 100, true, false),
    (v_pipe, v_org, 'Perdido', 5, 0, false, true);

  insert into categories (org_id, scope, kind, name) values
    (v_org, 'business', 'income',  'Avenças'),
    (v_org, 'business', 'income',  'Serviços pontuais'),
    (v_org, 'business', 'expense', 'Software'),
    (v_org, 'business', 'expense', 'Representação'),
    (v_org, 'business', 'expense', 'Contabilidade'),
    (v_org, 'business', 'expense', 'Impostos e Segurança Social'),
    (v_org, 'business', 'expense', 'Salários'),
    (v_org, 'business', 'expense', 'Marketing'),
    (v_org, 'personal', 'income',  'Salário'),
    (v_org, 'personal', 'income',  'Rendimentos'),
    (v_org, 'personal', 'expense', 'Casa'),
    (v_org, 'personal', 'expense', 'Supermercado'),
    (v_org, 'personal', 'expense', 'Restaurantes'),
    (v_org, 'personal', 'expense', 'Transportes'),
    (v_org, 'personal', 'expense', 'Saúde'),
    (v_org, 'personal', 'expense', 'Lazer'),
    (v_org, 'personal', 'expense', 'Investimento'),
    (v_org, 'personal', 'transfer','Transferência interna');
  return v_org;
end $$;

-- Mudar de etapa atualiza estado do negócio; ganhar uma avença cria receita recorrente
create or replace function deals_on_stage_change() returns trigger
language plpgsql security definer set search_path = public as $$
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
    values (new.org_id, coalesce(new.owner_id, auth.uid()), 'Onboarding: ' || new.title, current_date + 3, new.id, 'crm');
  end if;
  return new;
end $$;
create trigger deals_stage_trg before insert or update of stage_id on deals
  for each row execute function deals_on_stage_change();

-- Actividade atualiza "último contacto" do negócio (alerta de negócio a arrefecer)
create or replace function activities_touch_deal() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.deal_id is not null and new.done then
    update deals set last_activity_at = greatest(last_activity_at, new.occurred_at) where id = new.deal_id;
  end if;
  return new;
end $$;
create trigger activities_touch_trg after insert on activities
  for each row execute function activities_touch_deal();

-- =====================================================================
-- Vistas (security_invoker = respeitam RLS de quem consulta)
-- =====================================================================
create view v_account_balances with (security_invoker = true) as
select a.id, a.org_id, a.scope, a.owner_id, a.name, a.bank, a.type,
       coalesce(
         (select s.balance from account_snapshots s where s.account_id = a.id order by s.date desc limit 1),
         a.opening_balance + coalesce((select sum(t.amount) from transactions t where t.account_id = a.id), 0)
       ) as balance
from accounts a where not a.archived;

create view v_deals with (security_invoker = true) as
select d.*,
       s.name as stage_name, s.position as stage_position,
       coalesce(d.probability, s.probability) as eff_probability,
       case when d.kind = 'retainer' then d.value * d.duration_months else d.value end as total_value,
       round((case when d.kind = 'retainer' then d.value * d.duration_months else d.value end)
             * coalesce(d.probability, s.probability) / 100.0, 2) as weighted_value,
       c.name as company_name,
       (d.status = 'open' and d.last_activity_at < now() - interval '10 days') as is_cooling
from deals d
join stages s on s.id = d.stage_id
left join companies c on c.id = d.company_id;

-- Progresso dos Key Results, com fontes automáticas
create view v_key_results with (security_invoker = true) as
select kr.*,
  case kr.source
    when 'manual' then kr.current_value
    when 'finance_income' then coalesce((
      select sum(t.amount) from transactions t join accounts a on a.id = t.account_id
      where a.org_id = kr.org_id and a.scope = 'business' and t.amount > 0 and not t.is_transfer
        and t.date >= coalesce((kr.source_config->>'from')::date, date_trunc('year', now())::date)), 0)
    when 'finance_savings' then coalesce((
      select sum(b.balance) from v_account_balances b
      where b.org_id = kr.org_id and b.scope = 'personal' and b.type in ('savings','investment')), 0)
    when 'crm_mrr' then coalesce((
      select sum(r.amount) from recurring r
      where r.org_id = kr.org_id and r.scope = 'business' and r.active and r.amount > 0
        and (r.ends_on is null or r.ends_on >= current_date)), 0)
    when 'crm_won_value' then coalesce((
      select sum(case when d.kind = 'retainer' then d.value * d.duration_months else d.value end) from deals d
      where d.org_id = kr.org_id and d.status = 'won'
        and d.won_at >= coalesce((kr.source_config->>'from')::date, date_trunc('year', now())::date)), 0)
    when 'crm_won_count' then (
      select count(*) from deals d where d.org_id = kr.org_id and d.status = 'won'
        and d.won_at >= coalesce((kr.source_config->>'from')::date, date_trunc('year', now())::date))
    when 'habit' then (
      select count(*) from habit_logs l join habits h on h.id = l.habit_id
      where h.key_result_id = kr.id)
  end as computed_value
from key_results kr;
