set search_path = p360, public, extensions;

-- O primeiro valor a receber de uma avença nunca é anterior ao seu início
create or replace function sync_receivables(p_org uuid) returns void
language plpgsql security definer set search_path = p360, public as $$
declare r record; rv record; m date; v_due date; v_vat numeric; v_end date; v_tid uuid; v_tdate date;
begin
  if not (can_read(p_org, 'finance') or is_member(p_org)) then raise exception 'Sem acesso'; end if;
  v_vat := org_vat(p_org);
  for r in select * from recurring where org_id = p_org and active and amount > 0 loop
    m := date_trunc('month', r.starts_on)::date;
    v_end := least(coalesce(r.ends_on, current_date + 31), current_date + 31);
    while m <= v_end loop
      v_due := (m + make_interval(days => least(r.day_of_month, extract(day from (m + interval '1 month - 1 day'))::int) - 1))::date;
      if v_due >= r.starts_on and (r.ends_on is null or v_due <= r.ends_on) then   -- nunca antes do início da avença
        insert into receivables (org_id, scope, owner_id, deal_id, recurring_id, description, amount, due_date)
        values (p_org, r.scope, r.owner_id, r.deal_id, r.id, r.description,
                round(r.amount * case when r.scope = 'business' then (1 + v_vat / 100) else 1 end, 2), v_due)
        on conflict (recurring_id, due_date) do nothing;
      end if;
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

revoke execute on function sync_receivables(uuid) from anon, public;
grant execute on function sync_receivables(uuid) to authenticated, service_role;
