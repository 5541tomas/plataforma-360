set search_path = p360, public, extensions;

-- Permite apagar uma organização inteira (o dono só é protegido enquanto a organização existir)
create or replace function protect_owner() returns trigger
language plpgsql set search_path = p360, public as $$
begin
  if tg_op = 'DELETE' and old.role = 'owner' then
    if exists (select 1 from organizations where id = old.org_id) then raise exception 'O dono não pode ser removido'; end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.role = 'owner' and (new.role <> 'owner' or new.perm_goals <> 'write' or new.perm_finance <> 'write' or new.perm_crm <> 'write') then
    raise exception 'As permissões do dono não podem ser alteradas';
  end if;
  if tg_op = 'UPDATE' and new.role = 'owner' and old.role <> 'owner' then raise exception 'Não é possível promover a dono'; end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
