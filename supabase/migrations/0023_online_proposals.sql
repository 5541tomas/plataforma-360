set search_path = p360, public, extensions;

-- =====================================================================
-- PROPOSTAS ONLINE: link para o cliente, visualizações e aceitação online
-- =====================================================================
alter table proposals
  add column if not exists public_token    uuid not null default gen_random_uuid(),
  add column if not exists views           int not null default 0,
  add column if not exists first_viewed_at timestamptz,
  add column if not exists last_viewed_at  timestamptz,
  add column if not exists accepted_at     timestamptz,
  add column if not exists accepted_name   text;
create unique index if not exists proposals_public_token on proposals(public_token);

-- Ler a proposta pelo link (conta a visita; a primeira abertura gera nota + tarefa "liga agora")
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
      'nif', o.nif, 'address', o.address, 'email', o.email, 'phone', o.phone, 'website', o.website, 'iban', o.iban), 'prepared_by', coalesce(o.signature_name, pr.full_name, o.name))
    into v from organizations o left join profiles pr on pr.id = o.created_by where o.id = p.org_id;
  return v;
end $$;

-- Aceitar online: marca aceite, passa o negócio a Ganho (receita, cobrança e onboarding automáticos)
create or replace function public_proposal_accept(p_token uuid, p_name text) returns text
language plpgsql security definer set search_path = p360, public as $$
declare p proposals%rowtype; v_owner uuid; v_won uuid; d deals%rowtype;
begin
  if coalesce(trim(p_name), '') = '' then raise exception 'Escreve o teu nome para aceitar'; end if;
  select * into p from proposals where public_token = p_token and status in ('sent', 'accepted');
  if not found then raise exception 'Proposta indisponível'; end if;
  if p.status = 'accepted' then return 'already'; end if;
  if p.valid_until is not null and p.valid_until < current_date then raise exception 'Esta proposta expirou. Pede uma versão atualizada.'; end if;
  select * into d from deals where id = p.deal_id;
  select coalesce(d.owner_id, created_by) into v_owner from organizations where id = p.org_id;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  update proposals set status = 'accepted', accepted_at = now(), accepted_name = left(trim(p_name), 120), updated_at = now() where id = p.id;
  insert into activities (org_id, deal_id, contact_id, type, summary, created_by)
  values (p.org_id, p.deal_id, d.contact_id, 'note', 'Proposta ' || p.number || ' aceite online por ' || left(trim(p_name), 120), v_owner);
  if d.status <> 'won' then
    select id into v_won from stages where pipeline_id = d.pipeline_id and is_won limit 1;
    if v_won is not null then update deals set stage_id = v_won where id = d.id; end if;
  end if;
  insert into tasks (org_id, owner_id, title, due_date, deal_id, module)
  values (p.org_id, v_owner, 'Proposta aceite! Dar as boas-vindas a ' || left(trim(p_name), 80) || ' e marcar o arranque', current_date, p.deal_id, 'crm');
  return 'ok';
end $$;

grant execute on function public_proposal(uuid, boolean), public_proposal_accept(uuid, text) to anon, authenticated;
