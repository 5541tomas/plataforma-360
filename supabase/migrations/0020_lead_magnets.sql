set search_path = p360, public, extensions;

-- =====================================================================
-- LEAD MAGNETS: diagnósticos interativos (quiz) e ebooks com captura
-- =====================================================================
create table if not exists lead_magnets (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  slug        text not null check (slug ~ '^[a-z0-9-]{2,60}$'),
  kind        text not null check (kind in ('quiz', 'ebook')),
  title       text not null,
  subtitle    text,
  config      jsonb not null default '{}'::jsonb,  -- quiz: {areas, questions, levels}; ebook: {content}
  offer       jsonb not null default '{}'::jsonb,  -- {meeting_url, meeting_label, email_subject, email_body}
  sequence_id uuid references sequences(id) on delete set null,
  active      boolean not null default true,
  views       int not null default 0,
  created_at  timestamptz not null default now(),
  unique (org_id, slug)
);
create table if not exists magnet_responses (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  magnet_id  uuid not null references lead_magnets(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  deal_id    uuid references deals(id) on delete set null,
  answers    jsonb,
  scores     jsonb,          -- {"posicionamento": 67, ...} em %
  total      int,
  weakest    text,           -- nome legível da área mais fraca
  result_url text,
  ebook_url  text,
  created_at timestamptz not null default now()
);
create index if not exists magnet_responses_contact on magnet_responses(contact_id, created_at desc);
alter table lead_magnets enable row level security;
alter table magnet_responses enable row level security;
drop policy if exists lm_read on lead_magnets; drop policy if exists lm_write on lead_magnets;
drop policy if exists mr_read on magnet_responses; drop policy if exists mr_write on magnet_responses;
create policy lm_read on lead_magnets for select using (can_read(org_id, 'crm'));
create policy lm_write on lead_magnets for all using (can_write(org_id, 'crm')) with check (can_write(org_id, 'crm'));
create policy mr_read on magnet_responses for select using (can_read(org_id, 'crm'));
create policy mr_write on magnet_responses for all using (can_write(org_id, 'crm')) with check (can_write(org_id, 'crm'));

-- Variáveis novas nas mensagens: {{pontuacao}} {{area_fraca}} {{link_resultado}} {{link_ebook}} {{link_reuniao}}
create or replace function render_template(p_text text, p_contact uuid, p_deal uuid) returns text
language plpgsql stable security definer set search_path = p360, public as $$
declare c contacts%rowtype; v_company text; v_product text; v_deal text; v_me text; v_org uuid; mr record;
begin
  select * into c from contacts where id = p_contact;
  select name into v_company from companies where id = c.company_id;
  select d.title, p.name into v_deal, v_product from deals d left join products p on p.id = d.product_id where d.id = p_deal;
  select coalesce(o.signature_name, pr.full_name, o.name) into v_me from organizations o left join profiles pr on pr.id = o.created_by where o.id = c.org_id;
  select r.total, r.weakest, r.result_url, r.ebook_url, coalesce(nullif(m.offer->>'meeting_url', ''), r.result_url || '#reuniao') as meeting
    into mr from magnet_responses r join lead_magnets m on m.id = r.magnet_id where r.contact_id = p_contact order by r.created_at desc limit 1;
  return replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(coalesce(p_text, ''),
    '{{pontuacao}}', coalesce(mr.total::text, '')),
    '{{area_fraca}}', coalesce(mr.weakest, 'vendas')),
    '{{link_resultado}}', coalesce(mr.result_url, '')),
    '{{link_ebook}}', coalesce(mr.ebook_url, '')),
    '{{link_reuniao}}', coalesce(mr.meeting, '')),
    '{{nome}}', coalesce(c.name, '')),
    '{{primeiro_nome}}', coalesce(split_part(c.name, ' ', 1), '')),
    '{{empresa}}', coalesce(v_company, 'a vossa empresa')),
    '{{produto}}', coalesce(v_product, 'o nosso trabalho')),
    '{{negocio}}', coalesce(v_deal, '')),
    '{{meu_nome}}', coalesce(split_part(v_me, ' ', 1), ''));
end $$;

create or replace function run_automations(p_org uuid) returns jsonb
language plpgsql security definer set search_path = p360, public as $$
declare
  r automation_rules%rowtype; e record; st sequence_steps%rowtype; vd record; vc contacts%rowtype;
  v_next int; v_created int := 0; v_stopped int := 0; v_days int; v_owner uuid; v_body text; v_subject text;
begin
  if not is_member(p_org) then raise exception 'Sem acesso'; end if;
  if not can_write(p_org, 'crm') then return jsonb_build_object('skipped', true); end if;

  -- 1) Regras por tempo
  for r in select * from automation_rules where org_id = p_org and active and trigger in ('inactive_days', 'lost_after_days', 'client_every_days') loop
    v_days := coalesce((r.trigger_config->>'days')::int, 30);
    for vd in
      select dl.id from deals dl where dl.org_id = p_org and (
        (r.trigger = 'inactive_days' and dl.status = 'open' and dl.last_activity_at < now() - make_interval(days => v_days)) or
        (r.trigger = 'lost_after_days' and dl.status = 'lost' and dl.closed_at < now() - make_interval(days => v_days)) or
        (r.trigger = 'client_every_days' and dl.status = 'won' and coalesce(dl.won_at, dl.closed_at) < now() - make_interval(days => v_days)))
      and not exists (select 1 from rule_log l where l.rule_id = r.id and l.deal_id = dl.id
                      and (r.trigger = 'lost_after_days' or l.at > now() - make_interval(days => v_days)))
    loop
      perform apply_rule(r, vd.id);
    end loop;
  end loop;

  -- 2) Sequências: parar quando faz sentido
  for e in select en.*, s.stop_on_stage_change, s.stop_on_reply, s.for_closed_deals from enrollments en join sequences s on s.id = en.sequence_id
           where en.org_id = p_org and en.status = 'active' loop
    if e.deal_id is not null and not e.for_closed_deals and exists (select 1 from deals where id = e.deal_id and status <> 'open') then
      update enrollments set status = 'stopped', stopped_reason = 'Negócio fechado' where id = e.id; v_stopped := v_stopped + 1; continue;
    end if;
    if e.stop_on_stage_change and e.deal_id is not null and exists (select 1 from deals where id = e.deal_id and stage_id is distinct from e.stage_at_start) and not e.for_closed_deals then
      update enrollments set status = 'stopped', stopped_reason = 'Negócio mudou de etapa' where id = e.id; v_stopped := v_stopped + 1; continue;
    end if;
    if e.stop_on_reply and exists (select 1 from activities a where (a.contact_id = e.contact_id or (e.deal_id is not null and a.deal_id = e.deal_id))
         and a.occurred_at > e.started_at and a.type in ('call', 'meeting', 'email') and a.summary not like 'Automático:%') then
      update enrollments set status = 'stopped', stopped_reason = 'Contacto registado' where id = e.id; v_stopped := v_stopped + 1; continue;
    end if;
  end loop;

  -- 3) Sequências: preparar os passos que vencem hoje
  for e in select * from enrollments where org_id = p_org and status = 'active' and next_run_at <= current_date loop
    select * into st from sequence_steps where sequence_id = e.sequence_id and position = e.next_step;
    if not found then update enrollments set status = 'completed' where id = e.id; continue; end if;
    select * into vc from contacts where id = e.contact_id;
    v_body := render_template(st.body, e.contact_id, e.deal_id);
    v_subject := render_template(st.subject, e.contact_id, e.deal_id);
    if st.channel = 'task' then
      v_owner := coalesce((select owner_id from deals where id = e.deal_id), (select created_by from organizations where id = p_org));
      insert into tasks (org_id, owner_id, title, due_date, deal_id, module) values (p_org, v_owner, left(v_body, 300), current_date, e.deal_id, 'crm');
    elsif st.channel = 'email' and (vc.email is null or vc.unsubscribed_at is not null) then
      null; -- sem email ou cancelou: salta o passo
    elsif st.channel = 'whatsapp' and vc.phone is null then
      null;
    else
      insert into outbox (org_id, enrollment_id, step_id, contact_id, deal_id, channel, to_address, subject, body, due_on)
      values (p_org, e.id, st.id, e.contact_id, e.deal_id, st.channel, case when st.channel = 'email' then vc.email else vc.phone end, v_subject, v_body, current_date);
      v_created := v_created + 1;
    end if;
    select min(position) into v_next from sequence_steps where sequence_id = e.sequence_id and position > e.next_step;
    if v_next is null then
      update enrollments set status = 'completed', next_step = e.next_step + 1 where id = e.id;
    else
      update enrollments set next_step = v_next,
        next_run_at = current_date + (select delay_days from sequence_steps where sequence_id = e.sequence_id and position = v_next) where id = e.id;
    end if;
  end loop;

  -- 4) Pontuação das leads (0–100)
  update contacts c set score = least(100, greatest(0,
      case coalesce(c.source, '') when 'Referência' then 30 else 0 end
    + case when c.source like 'Formulário%' then 20 when c.source in ('LinkedIn', 'Evento') then 15 when c.source = 'Cliente antigo' then 25 else 0 end
    + coalesce((select max(case when d.status = 'open' then 10 * s.position else 0 end) from deals d join stages s on s.id = d.stage_id where d.contact_id = c.id), 0)
    + coalesce((select count(*) * 5 from outbox o where o.contact_id = c.id and o.opened_at > now() - interval '30 days'), 0)
    + coalesce((select count(*) * 10 from outbox o where o.contact_id = c.id and o.clicked_at > now() - interval '30 days'), 0)
    + case when exists (select 1 from activities a where a.contact_id = c.id and a.occurred_at > now() - interval '7 days' and a.summary not like 'Automático:%') then 15 else 0 end
    + case when exists (select 1 from deals d where d.contact_id = c.id and d.product_id is not null and d.status = 'open') then 10 else 0 end
    - case when exists (select 1 from deals d where d.contact_id = c.id and d.status = 'open' and d.last_activity_at < now() - interval '21 days') then 20 else 0 end
    + case when exists (select 1 from magnet_responses mr where mr.contact_id = c.id and mr.created_at > now() - interval '30 days') then 15 else 0 end
    + case when exists (select 1 from magnet_responses mr where mr.contact_id = c.id and mr.created_at > now() - interval '30 days' and mr.total < 50) then 10 else 0 end
    - case when c.unsubscribed_at is not null then 30 else 0 end))
  where c.org_id = p_org;

  return jsonb_build_object('criadas', v_created, 'paradas', v_stopped);
end $$;

-- Página pública do lead magnet (conta a visita)
create or replace function public_magnet(p_org text, p_slug text) returns jsonb
language plpgsql security definer set search_path = p360, public as $$
declare v jsonb; v_id uuid;
begin
  select m.id, jsonb_build_object('id', m.id, 'kind', m.kind, 'title', m.title, 'subtitle', m.subtitle, 'config', m.config,
      'org', coalesce(o.legal_name, o.name), 'author', coalesce(o.signature_name, pr.full_name, o.name))
    into v_id, v
  from lead_magnets m join organizations o on o.id = m.org_id left join profiles pr on pr.id = o.created_by
  where o.public_slug = lower(p_org) and m.slug = lower(p_slug) and m.active;
  if v_id is null then return null; end if;
  update lead_magnets set views = views + 1 where id = v_id;
  return v;
end $$;

-- Submeter o diagnóstico / pedir o ebook: cria contacto, negócio, nota, tarefa, email (pendente de aprovação) e inscreve na sequência
create or replace function public_magnet_submit(p_org text, p_slug text, p_name text, p_email text, p_phone text,
  p_answers jsonb, p_scores jsonb, p_total int, p_weakest text, p_consent boolean, p_base text, p_honeypot text)
returns uuid
language plpgsql security definer set search_path = p360, public as $$
declare m lead_magnets%rowtype; o organizations%rowtype; v_owner uuid; v_contact uuid; v_deal uuid; v_pipe uuid; v_stage uuid;
  v_prod products%rowtype; v_rid uuid := gen_random_uuid(); v_base text; v_recent int; v_email text; v_summary text; v_body text; v_subject text;
begin
  if coalesce(p_honeypot, '') <> '' then return null; end if;
  v_email := lower(trim(coalesce(p_email, '')));
  if coalesce(trim(p_name), '') = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Indica o teu nome e um email válido'; end if;
  select * into o from organizations where public_slug = lower(p_org);
  if not found then raise exception 'Página indisponível'; end if;
  select * into m from lead_magnets where org_id = o.id and slug = lower(p_slug) and active;
  if not found then raise exception 'Página indisponível'; end if;
  select count(*) into v_recent from magnet_responses where org_id = o.id and created_at > now() - interval '1 hour';
  if v_recent >= 30 then raise exception 'Demasiados pedidos. Tenta mais tarde.'; end if;
  v_base := rtrim(coalesce(p_base, ''), '/');
  if v_base !~ '^https?://' then v_base := ''; end if;
  v_owner := o.created_by;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);

  -- Contacto: reaproveita pelo email
  select id into v_contact from contacts where org_id = o.id and lower(email) = v_email order by created_at limit 1;
  if v_contact is null then
    insert into contacts (org_id, name, email, phone, source)
    values (o.id, left(trim(p_name), 120), v_email, nullif(left(trim(coalesce(p_phone, '')), 40), ''), left('Lead magnet · ' || m.title, 120))
    returning id into v_contact;
  else
    update contacts set phone = coalesce(phone, nullif(left(trim(coalesce(p_phone, '')), 40), '')) where id = v_contact;
  end if;
  if p_consent then update contacts set consent_marketing = true, consent_at = now(), unsubscribed_at = null where id = v_contact; end if;

  -- Negócio: reaproveita um aberto; senão cria "Reunião 1:1"
  select id into v_deal from deals where contact_id = v_contact and status = 'open' order by created_at desc limit 1;
  if v_deal is null then
    select * into v_prod from products where org_id = o.id and active and (name ilike '%1:1%' or name ilike '%1 para 1%' or name ilike '%individual%') order by position limit 1;
    select id into v_pipe from pipelines where org_id = o.id order by position limit 1;
    select id into v_stage from stages where pipeline_id = v_pipe and not is_won and not is_lost order by position limit 1;
    insert into deals (org_id, pipeline_id, stage_id, contact_id, owner_id, title, kind, value, product_id, source)
    values (o.id, v_pipe, v_stage, v_contact, v_owner, coalesce(v_prod.name, 'Reunião 1:1') || ' — ' || left(trim(p_name), 80),
            coalesce(v_prod.kind, 'one_off'), coalesce(v_prod.price, 0), v_prod.id, 'Lead magnet')
    returning id into v_deal;
  end if;

  insert into magnet_responses (id, org_id, magnet_id, contact_id, deal_id, answers, scores, total, weakest, result_url, ebook_url)
  values (v_rid, o.id, m.id, v_contact, v_deal, p_answers, p_scores, case when m.kind = 'quiz' then greatest(0, least(100, p_total)) end,
          case when m.kind = 'quiz' then left(p_weakest, 60) end,
          case when m.kind = 'quiz' then v_base || '/r/' || v_rid end, v_base || '/e/' || v_rid);

  v_summary := case when m.kind = 'quiz'
    then m.title || ': ' || p_total || '/100 · área mais fraca: ' || coalesce(p_weakest, '—')
    else 'Pediu o ebook «' || m.title || '»' end;
  insert into activities (org_id, deal_id, contact_id, type, summary, created_by) values (o.id, v_deal, v_contact, 'note', 'Lead magnet — ' || v_summary, v_owner);
  insert into tasks (org_id, owner_id, title, due_date, deal_id, module)
  values (o.id, v_owner, left('Contactar ' || trim(p_name) || ' — ' || v_summary, 300), current_date, v_deal, 'crm');

  -- Email com o resultado / ebook: fica na fila à espera da tua aprovação
  v_subject := render_template(coalesce(nullif(m.offer->>'email_subject', ''), 'O teu resultado'), v_contact, v_deal);
  v_body := render_template(coalesce(nullif(m.offer->>'email_body', ''), 'Olá {{primeiro_nome}},' || chr(10) || chr(10) || '{{link_ebook}}'), v_contact, v_deal);
  if not exists (select 1 from contacts where id = v_contact and unsubscribed_at is not null) then
    insert into outbox (org_id, contact_id, deal_id, channel, to_address, subject, body, due_on)
    values (o.id, v_contact, v_deal, 'email', v_email, v_subject, v_body, current_date);
  end if;
  if m.sequence_id is not null then perform enroll_contact(m.sequence_id, v_contact, v_deal); end if;
  return v_rid;
end $$;

-- Página de resultado (o id da resposta funciona como chave)
create or replace function public_magnet_result(p_rid uuid) returns jsonb
language sql stable security definer set search_path = p360, public as $$
  select jsonb_build_object('kind', m.kind, 'title', m.title, 'config', m.config, 'scores', r.scores, 'total', r.total, 'weakest', r.weakest,
    'first_name', split_part(c.name, ' ', 1), 'org', coalesce(o.legal_name, o.name), 'author', coalesce(o.signature_name, pr.full_name, o.name),
    'meeting_url', nullif(m.offer->>'meeting_url', ''), 'meeting_label', nullif(m.offer->>'meeting_label', ''),
    'phone', pr.phone, 'email', coalesce(nullif(o.settings->'email'->>'reply_to', ''), nullif(o.settings->'email'->>'from_email', ''), 'geral@thomasfaria.pt'),
    'has_ebook', exists (select 1 from lead_magnets e where e.org_id = o.id and e.kind = 'ebook' and e.active))
  from magnet_responses r join lead_magnets m on m.id = r.magnet_id join organizations o on o.id = r.org_id
  left join contacts c on c.id = r.contact_id left join profiles pr on pr.id = o.created_by
  where r.id = p_rid;
$$;

-- Ebook: disponível para quem respondeu a um lead magnet da organização
create or replace function public_ebook(p_rid uuid) returns jsonb
language sql stable security definer set search_path = p360, public as $$
  select jsonb_build_object('title', e.title, 'subtitle', e.subtitle, 'content', e.config->>'content',
    'author', coalesce(o.signature_name, pr.full_name, o.name), 'org', coalesce(o.legal_name, o.name), 'first_name', split_part(c.name, ' ', 1),
    'result', case when m.kind = 'quiz' then r.id end)
  from magnet_responses r join lead_magnets m on m.id = r.magnet_id join organizations o on o.id = r.org_id
  join lateral (select * from lead_magnets x where x.org_id = o.id and x.kind = 'ebook' and x.active order by x.created_at limit 1) e on true
  left join contacts c on c.id = r.contact_id left join profiles pr on pr.id = o.created_by
  where r.id = p_rid;
$$;

grant select, insert, update, delete on lead_magnets, magnet_responses to authenticated, service_role;
grant execute on function public_magnet(text, text), public_magnet_submit(text, text, text, text, text, jsonb, jsonb, int, text, boolean, text, text),
  public_magnet_result(uuid), public_ebook(uuid) to anon, authenticated;
grant execute on function render_template(text, uuid, uuid), run_automations(uuid) to authenticated, service_role;
revoke execute on function render_template(text, uuid, uuid), run_automations(uuid) from anon, public;
grant execute on function mcp_call(text, text, jsonb), public_lead(text, text, text, text, text, text, text, text), public_form_info(text),
  track_email(uuid, text), unsubscribe(uuid), public_lead_consent(text, text, boolean) to anon;

-- Leitura sem contar visita (usada ao submeter)
create or replace function public_magnet_peek(p_org text, p_slug text) returns jsonb
language sql stable security definer set search_path = p360, public as $$
  select jsonb_build_object('kind', m.kind, 'config', m.config)
  from lead_magnets m join organizations o on o.id = m.org_id
  where o.public_slug = lower(p_org) and m.slug = lower(p_slug) and m.active;
$$;
grant execute on function public_magnet_peek(text, text) to anon, authenticated;
