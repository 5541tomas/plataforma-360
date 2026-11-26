set search_path = p360, public, extensions;

-- Antes de gravar: só calcula o estado (open/won/lost) a partir da etapa
create or replace function deals_on_stage_change() returns trigger
language plpgsql security definer set search_path = p360, public as $$
declare v_stage stages%rowtype;
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
  return new;
end $$;

-- Depois de gravar: efeitos de um negócio ganho (o negócio já existe, por isso as FKs são válidas)
create or replace function deals_after_won() returns trigger
language plpgsql security definer set search_path = p360, public as $$
declare v_cat uuid;
begin
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
  return null;
end $$;

drop trigger if exists deals_after_won_trg on deals;
create trigger deals_after_won_trg after insert or update of stage_id on deals
  for each row execute function deals_after_won();

grant execute on function deals_after_won() to authenticated, service_role;
