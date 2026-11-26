set search_path = p360, public, extensions;

-- Acrescenta o saldo inicial à vista (necessário para editar contas)
create or replace view v_account_balances with (security_invoker = true) as
select a.id, a.org_id, a.scope, a.owner_id, a.name, a.bank, a.type,
       coalesce(
         (select s.balance from account_snapshots s where s.account_id = a.id order by s.date desc limit 1),
         a.opening_balance + coalesce((select sum(t.amount) from transactions t where t.account_id = a.id), 0)
       ) as balance,
       a.opening_balance
from accounts a where not a.archived;

grant select on v_account_balances to authenticated, service_role;
