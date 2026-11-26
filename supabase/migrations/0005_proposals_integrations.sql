set search_path = p360, public, extensions;

-- Dados da empresa para propostas
alter table organizations
  add column if not exists legal_name text,
  add column if not exists nif text,
  add column if not exists address text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists website text,
  add column if not exists iban text;

-- Propostas: texto de introdução, condições e IVA
alter table proposals
  add column if not exists title text,
  add column if not exists intro text,
  add column if not exists terms text,
  add column if not exists vat_rate numeric(5,2) not null default 23,
  add column if not exists recurring boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

-- Integrações (Google): tokens visíveis apenas para o próprio utilizador
create table if not exists integrations (
  user_id        uuid not null references auth.users(id) on delete cascade default auth.uid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  provider       text not null check (provider in ('google')),
  account_email  text,
  refresh_token  text,
  access_token   text,
  expires_at     timestamptz,
  last_sync_at   timestamptz,
  created_at     timestamptz not null default now(),
  primary key (user_id, org_id, provider)
);
alter table integrations enable row level security;
drop policy if exists integrations_own on integrations;
create policy integrations_own on integrations for all
  using (user_id = auth.uid() and is_member(org_id))
  with check (user_id = auth.uid() and is_member(org_id));

-- Evitar duplicar emails/reuniões sincronizados
create unique index if not exists activities_external_uniq on activities (org_id, external_id); -- NULLs não colidem

grant select, insert, update, delete on all tables in schema p360 to authenticated, service_role;
