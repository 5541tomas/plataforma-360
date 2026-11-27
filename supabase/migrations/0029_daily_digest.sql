set search_path = p360, public, extensions;

-- Resumo do dia (chamado pelo servidor com a chave interna)
create or replace function daily_digest(p_secret text) returns jsonb
language plpgsql security definer set search_path = p360, public as $$
declare v_org uuid; o organizations%rowtype; v_today date := (now() at time zone 'Europe/Lisbon')::date; v jsonb;
begin
  v_org := org_of_secret(p_secret);
  if v_org is null then raise exception 'Sem permissão'; end if;
  select * into o from organizations where id = v_org;
  if not coalesce((o.settings->'digest'->>'enabled')::boolean, false) then return jsonb_build_object('enabled', false); end if;
  select jsonb_build_object(
    'enabled', true,
    'email', coalesce(o.settings->'digest'->>'email', (select email from auth.users where id = o.created_by)),
    'name', split_part(coalesce(o.signature_name, (select full_name from profiles where id = o.created_by), o.name), ' ', 1),
    'org', o.name,
    'meetings', coalesce((select jsonb_agg(jsonb_build_object('time', to_char(b.starts_at at time zone 'Europe/Lisbon', 'HH24:MI'), 'name', b.name, 'notes', b.notes) order by b.starts_at)
        from bookings b where b.org_id = v_org and b.status = 'confirmed' and (b.starts_at at time zone 'Europe/Lisbon')::date = v_today), '[]'::jsonb),
    'queue', (select count(*) from outbox x where x.org_id = v_org and x.status = 'pending' and x.campaign_id is null),
    'tasks', coalesce((select jsonb_agg(jsonb_build_object('title', t.title, 'late', t.due_date < v_today) order by t.due_date) from (
        select title, due_date from tasks where org_id = v_org and owner_id = o.created_by and not done and due_date <= v_today order by due_date limit 8) t), '[]'::jsonb),
    'tasks_total', (select count(*) from tasks where org_id = v_org and owner_id = o.created_by and not done and due_date <= v_today),
    'hot', coalesce((select jsonb_agg(jsonb_build_object('name', c.name, 'score', c.score)) from (
        select name, score from contacts where org_id = v_org and score >= 60 and unsubscribed_at is null order by score desc limit 3) c), '[]'::jsonb),
    'overdue', (select jsonb_build_object('n', count(*), 'sum', coalesce(sum(amount), 0)) from receivables where org_id = v_org and status = 'open' and due_date < v_today),
    'week_in', (select coalesce(sum(amount), 0) from receivables where org_id = v_org and status = 'open' and due_date between v_today and v_today + 7),
    'won_month', (select coalesce(sum(value), 0) from deals where org_id = v_org and status = 'won' and closed_at >= date_trunc('month', v_today)),
    'proposals_open', (select count(*) from proposals where org_id = v_org and status = 'sent'),
    'proposals_viewed', coalesce((select jsonb_agg(jsonb_build_object('number', p.number, 'views', p.views)) from proposals p where p.org_id = v_org and p.status = 'sent' and p.last_viewed_at > now() - interval '1 day'), '[]'::jsonb)
  ) into v;
  return v;
end $$;
revoke execute on function daily_digest(text) from public;
grant execute on function daily_digest(text) to anon, authenticated;
