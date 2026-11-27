set search_path = p360, public, extensions;
-- Pagamento na proposta só aparece se o dono o ativar (desligado por defeito)
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
    'pay', jsonb_build_object('enabled', coalesce((o.settings->'payments'->>'enabled')::boolean, false), 'deposit_pct', coalesce((o.settings->'payments'->>'deposit_pct')::numeric, 50), 'mbway', o.settings->'payments'->>'mbway', 'iban', o.iban,
      'holder', coalesce(nullif(o.legal_name, ''), o.name), 'paid_at', p.paid_at, 'paid_amount', p.paid_amount, 'claimed_at', p.payment_claimed_at))
    into v from organizations o left join profiles pr on pr.id = o.created_by where o.id = p.org_id;
  return v;
end $$;
grant execute on function public_proposal(uuid, boolean) to anon, authenticated;
