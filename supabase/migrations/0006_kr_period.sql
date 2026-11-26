set search_path = p360, public, extensions;

-- KRs automáticos com período fechado: source_config {"from": "2027-01-01", "to": "2027-04-01"} (to exclusivo)
create or replace view v_key_results with (security_invoker = true) as
select kr.*,
  case kr.source
    when 'manual' then kr.current_value
    when 'finance_income' then coalesce((
      select sum(t.amount) from transactions t join accounts a on a.id = t.account_id
      where a.org_id = kr.org_id and a.scope = 'business' and t.amount > 0 and not t.is_transfer
        and t.date >= coalesce((kr.source_config->>'from')::date, date_trunc('year', now())::date)
        and t.date < coalesce((kr.source_config->>'to')::date, 'infinity'::date)), 0)
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
        and d.won_at >= coalesce((kr.source_config->>'from')::date, date_trunc('year', now())::date)
        and d.won_at < coalesce((kr.source_config->>'to')::date, 'infinity'::date)), 0)
    when 'crm_won_count' then (
      select count(*) from deals d where d.org_id = kr.org_id and d.status = 'won'
        and d.won_at >= coalesce((kr.source_config->>'from')::date, date_trunc('year', now())::date)
        and d.won_at < coalesce((kr.source_config->>'to')::date, 'infinity'::date))
    when 'habit' then (
      select count(*) from habit_logs l join habits h on h.id = l.habit_id
      where h.key_result_id = kr.id)
  end as computed_value
from key_results kr;

-- =====================================================================
-- Acesso via API (PostgREST): o schema p360 tem de estar em "Exposed schemas"
-- =====================================================================
grant usage on schema p360 to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema p360 to authenticated, service_role;
grant usage, select on all sequences in schema p360 to authenticated, service_role;
grant execute on all functions in schema p360 to authenticated, service_role;
revoke execute on all functions in schema p360 from anon, public;
alter default privileges in schema p360 grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema p360 grant execute on functions to authenticated, service_role;

grant select on v_key_results to authenticated, service_role;
