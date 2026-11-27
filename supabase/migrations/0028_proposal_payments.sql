set search_path = p360, public, extensions;

-- =====================================================================
-- PAGAMENTO DO SINAL NA PROPOSTA ACEITE
-- =====================================================================
alter table proposals
  add column if not exists paid_at timestamptz,
  add column if not exists paid_amount numeric(14,2),
  add column if not exists payment_ref text,
  add column if not exists payment_claimed_at timestamptz,
  add column if not exists payment_claimed_method text;

-- Chave interna por organização (só o hash). Gerada nas Definições e colocada no Netlify como APP_INTERNAL_SECRET;
-- usada pelo servidor para confirmar pagamentos (Stripe) e enviar o resumo diário.
drop table if exists app_secrets;
create table app_secrets (org_id uuid not null references organizations(id) on delete cascade, name text not null, hash text not null, created_at timestamptz not null default now(), primary key (org_id, name));
alter table app_secrets enable row level security;  -- sem políticas: só funções do servidor

create or replace function generate_internal_secret(p_org uuid) returns text
language plpgsql security definer set search_path = p360, public, extensions as $$
declare v text;
begin
  if not is_org_admin(p_org) then raise exception 'Só o dono pode gerar a chave'; end if;
  v := encode(extensions.gen_random_bytes(32), 'hex');
  insert into app_secrets (org_id, name, hash) values (p_org, 'internal', encode(extensions.digest(v, 'sha256'), 'hex'))
  on conflict (org_id, name) do update set hash = excluded.hash, created_at = now();
  return v;
end $$;

create or replace function org_of_secret(p_secret text) returns uuid
language sql stable security definer set search_path = p360, public, extensions as $$
  select org_id from app_secrets where name = 'internal' and hash = encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex') limit 1;
$$;
revoke execute on function org_of_secret(text) from anon, authenticated, public;
grant execute on function generate_internal_secret(uuid) to authenticated;
revoke execute on function generate_internal_secret(uuid) from anon, public;


create or replace function public_proposal(p_token uuid, p_count boolean default true) returns jsonb
language plpgsql security definer set search_path = p360, public as $$
declare p proposals%rowtype; v jsonb; v_owner uuid; d record;
begin
  select * into p from proposals where public_token = p_token and status <> 'draft';
  if not found then return null; end if;
  select dl.title, dl.contact_id, dl.owner_id, c.name as company_name, ct.name as contact_name, dl.duration_months
    into d from deals dl left join companies c on c.id = dl.company_id left join contacts ct on ct.id = dl.contact_id where dl.id = p.deal_id;
  if p_count and (p.last_viewed_at is null or p.last_viewed_at < now() - interval '30 minutes') then
    update proposals set views = views + 1, first_viewed_at = coalesce(first_viewed_at, now()), last_viewed_at = now() where id = p.id;
    select coalesce(d.owner_id, created_by) into v_owner from organizations where id = p.org_id;
    perform set_config('request.jwt.claim.sub', v_owner::text, true);
    insert into activities (org_id, deal_id, contact_id, type, summary, created_by)
    values (p.org_id, p.deal_id, d.contact_id, 'note', 'Automático: o cliente abriu a proposta ' || p.number || case when p.views > 0 then ' (' || (p.views + 1) || '.ª vez)' else '' end, v_owner);
    if p.first_viewed_at is null and p.status = 'sent' then
      insert into tasks (org_id, owner_id, title, due_date, deal_id, module)
      values (p.org_id, v_owner, 'Ligar agora: ' || coalesce(d.contact_name, d.company_name, 'o cliente') || ' abriu a proposta ' || p.number, current_date, p.deal_id, 'crm');
    end if;
  end if;
  select jsonb_build_object('p', to_jsonb(p) - 'public_token', 'deal', jsonb_build_object('title', d.title, 'company_name', d.company_name, 'contact_name', d.contact_name, 'duration_months', d.duration_months),
    'org', jsonb_build_object('name', o.name, 'legal_name', o.legal_name, 'about', o.about, 'testimonials', o.testimonials, 'signature_name', o.signature_name, 'signature_role', o.signature_role,
      'nif', o.nif, 'address', o.address, 'email', o.email, 'phone', o.phone, 'website', o.website, 'iban', o.iban), 'prepared_by', coalesce(o.signature_name, pr.full_name, o.name),
    'pay', jsonb_build_object('deposit_pct', coalesce((o.settings->'payments'->>'deposit_pct')::numeric, 50), 'mbway', o.settings->'payments'->>'mbway', 'iban', o.iban,
      'holder', coalesce(nullif(o.legal_name, ''), o.name), 'paid_at', p.paid_at, 'paid_amount', p.paid_amount, 'claimed_at', p.payment_claimed_at))
    into v from organizations o left join profiles pr on pr.id = o.created_by where o.id = p.org_id;
  return v;
end $$;

-- O cliente diz que pagou (transferência / MB WAY): tarefa para confirmares
create or replace function public_proposal_claim_paid(p_token uuid, p_method text) returns void
language plpgsql security definer set search_path = p360, public as $$
declare p proposals%rowtype; d deals%rowtype; v_owner uuid;
begin
  select * into p from proposals where public_token = p_token and status = 'accepted' and paid_at is null;
  if not found or p.payment_claimed_at is not null then return; end if;
  select * into d from deals where id = p.deal_id;
  select coalesce(d.owner_id, created_by) into v_owner from organizations where id = p.org_id;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  update proposals set payment_claimed_at = now(), payment_claimed_method = left(coalesce(p_method, ''), 20) where id = p.id;
  insert into activities (org_id, deal_id, contact_id, type, summary, created_by)
  values (p.org_id, p.deal_id, d.contact_id, 'note', 'O cliente indicou que pagou o sinal da proposta ' || p.number || ' por ' || coalesce(nullif(p_method, ''), 'transferência'), v_owner);
  insert into tasks (org_id, owner_id, title, due_date, deal_id, module)
  values (p.org_id, v_owner, 'Confirmar receção do sinal (' || coalesce(nullif(p_method, ''), 'transferência') || '): ' || d.title, current_date, p.deal_id, 'finance');
end $$;

-- Pagamento confirmado pelo servidor (Stripe): marca a proposta paga e regista o recebimento
create or replace function proposal_mark_paid(p_token uuid, p_amount numeric, p_ref text, p_secret text) returns text
language plpgsql security definer set search_path = p360, public as $$
declare p proposals%rowtype; d deals%rowtype; v_owner uuid; rv receivables%rowtype;
begin
  select * into p from proposals where public_token = p_token;
  if not found then return 'not_found'; end if;
  if org_of_secret(p_secret) is distinct from p.org_id then raise exception 'Sem permissão'; end if;
  if p.paid_at is not null then return 'already'; end if;
  select * into d from deals where id = p.deal_id;
  select coalesce(d.owner_id, created_by) into v_owner from organizations where id = p.org_id;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  update proposals set paid_at = now(), paid_amount = p_amount, payment_ref = left(p_ref, 120) where id = p.id;
  -- Abate à primeira cobrança em aberto deste negócio; o resto fica por receber
  select * into rv from receivables where deal_id = p.deal_id and status = 'open' order by due_date limit 1;
  if found then
    if p_amount >= rv.amount - 0.5 then
      update receivables set status = 'received', received_at = current_date where id = rv.id;
    else
      update receivables set amount = rv.amount - p_amount where id = rv.id;
      insert into receivables (org_id, scope, owner_id, deal_id, description, amount, due_date, status, received_at)
      values (rv.org_id, rv.scope, rv.owner_id, rv.deal_id, 'Sinal: ' || d.title, p_amount, current_date, 'received', current_date);
    end if;
  else
    insert into receivables (org_id, scope, owner_id, deal_id, description, amount, due_date, status, received_at)
    values (p.org_id, 'business', v_owner, p.deal_id, 'Sinal: ' || d.title, p_amount, current_date, 'received', current_date);
  end if;
  insert into activities (org_id, deal_id, contact_id, type, summary, created_by)
  values (p.org_id, p.deal_id, d.contact_id, 'note', 'Sinal pago online: ' || to_char(p_amount, 'FM999G999D00') || ' € (proposta ' || p.number || ')', v_owner);
  return 'ok';
end $$;

grant execute on function public_proposal(uuid, boolean), public_proposal_claim_paid(uuid, text) to anon, authenticated;
grant execute on function proposal_mark_paid(uuid, numeric, text, text) to anon, authenticated;

-- Confirma (sem revelar nada) se a chave configurada no servidor corresponde à desta organização
create or replace function internal_secret_matches(p_org uuid, p_secret text) returns boolean
language sql stable security definer set search_path = p360, public as $$
  select is_member(p_org) and org_of_secret(p_secret) = p_org;
$$;
grant execute on function internal_secret_matches(uuid, text) to authenticated;
revoke execute on function internal_secret_matches(uuid, text) from anon, public;
