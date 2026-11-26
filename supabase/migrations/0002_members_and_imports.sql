-- =====================================================================
-- 0002: gestão de membros, importação de extratos e pequenas melhorias
-- =====================================================================
set search_path = p360, public, extensions;

-- Adicionar um utilizador existente (por email) à organização. Só admins.
create or replace function add_member_by_email(
  p_org uuid, p_email text,
  p_goals access_level default 'none', p_finance access_level default 'none', p_crm access_level default 'write',
  p_role member_role default 'member'
) returns text
language plpgsql security definer set search_path = p360, public as $$
declare v_user uuid;
begin
  if not is_org_admin(p_org) then raise exception 'Sem permissão para gerir membros'; end if;
  if p_role = 'owner' then raise exception 'Não é possível adicionar outro dono'; end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then return 'not_found'; end if;
  insert into profiles (id, full_name)
    select v_user, coalesce(raw_user_meta_data->>'full_name', split_part(email, '@', 1)) from auth.users where id = v_user
    on conflict (id) do nothing;
  insert into members (org_id, user_id, role, perm_goals, perm_finance, perm_crm)
    values (p_org, v_user, p_role, p_goals, p_finance, p_crm)
    on conflict (org_id, user_id) do update
      set role = excluded.role, perm_goals = excluded.perm_goals, perm_finance = excluded.perm_finance, perm_crm = excluded.perm_crm;
  return 'ok';
end $$;

-- Lista de membros com email (auth.users não é acessível pela API)
create or replace function list_members(p_org uuid)
returns table (user_id uuid, email text, full_name text, role member_role, perm_goals access_level, perm_finance access_level, perm_crm access_level)
language sql stable security definer set search_path = p360, public as $$
  select m.user_id, u.email::text, p.full_name, m.role, m.perm_goals, m.perm_finance, m.perm_crm
  from members m
  join auth.users u on u.id = m.user_id
  left join profiles p on p.id = m.user_id
  where m.org_id = p_org and is_member(p_org)
  order by m.created_at;
$$;

-- O dono não pode ser removido nem despromovido por ninguém
create or replace function protect_owner() returns trigger
language plpgsql set search_path = p360, public as $$
begin
  if tg_op = 'DELETE' and old.role = 'owner' then raise exception 'O dono não pode ser removido'; end if;
  if tg_op = 'UPDATE' and old.role = 'owner' and (new.role <> 'owner' or new.perm_goals <> 'write' or new.perm_finance <> 'write' or new.perm_crm <> 'write') then
    raise exception 'As permissões do dono não podem ser alteradas';
  end if;
  if tg_op = 'UPDATE' and new.role = 'owner' and old.role <> 'owner' then raise exception 'Não é possível promover a dono'; end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger members_protect_owner before update or delete on members
  for each row execute function protect_owner();

-- Regras de categorização aprendidas (descrição normalizada -> categoria)
create table category_rules (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  owner_id     uuid not null references auth.users(id) default auth.uid(),
  pattern      text not null,      -- texto normalizado (minúsculas, sem números)
  category_id  uuid not null references categories(id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (org_id, owner_id, pattern)
);
alter table category_rules enable row level security;
create policy rules_own on category_rules for all using (owner_id = auth.uid() and is_member(org_id))
  with check (owner_id = auth.uid() and is_member(org_id));

grant select, insert, update, delete on all tables in schema p360 to authenticated, service_role;
grant execute on all functions in schema p360 to authenticated, service_role;
revoke execute on all functions in schema p360 from anon, public;
