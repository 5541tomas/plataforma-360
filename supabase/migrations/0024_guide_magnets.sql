set search_path = p360, public, extensions;

-- =====================================================================
-- LEAD MAGNETS v2: guia entregue por WhatsApp, área de atividade, páginas no estilo da marca
-- =====================================================================
alter table lead_magnets drop constraint if exists lead_magnets_kind_check;
alter table lead_magnets add constraint lead_magnets_kind_check check (kind in ('quiz', 'ebook', 'guide'));
alter table contacts add column if not exists area text;   -- área de atividade (ex.: "Design e fotografia")

-- Variáveis: + {{area}} {{link_guia}}; {{link_reuniao}} usa a agenda própria quando não há link externo
create or replace function render_template(p_text text, p_contact uuid, p_deal uuid) returns text
language plpgsql stable security definer set search_path = p360, public as $$
declare c contacts%rowtype; v_company text; v_product text; v_deal text; v_me text; mr record; o organizations%rowtype; v_base text;
begin
  select * into c from contacts where id = p_contact;
  select * into o from organizations where id = c.org_id;
  select name into v_company from companies where id = c.company_id;
  select d.title, p.name into v_deal, v_product from deals d left join products p on p.id = d.product_id where d.id = p_deal;
  select coalesce(o.signature_name, pr.full_name, o.name) into v_me from profiles pr where pr.id = o.created_by;
  v_me := coalesce(v_me, o.signature_name, o.name);
  select r.total, r.weakest, r.result_url, r.ebook_url, m.offer
    into mr from magnet_responses r join lead_magnets m on m.id = r.magnet_id where r.contact_id = p_contact order by r.created_at desc limit 1;
  v_base := regexp_replace(coalesce(mr.ebook_url, ''), '/e/[^/]*$', '');
  return replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(coalesce(p_text, ''),
    '{{pontuacao}}', coalesce(mr.total::text, '')),
    '{{area_fraca}}', coalesce(mr.weakest, 'vendas')),
    '{{link_resultado}}', coalesce(mr.result_url, '')),
    '{{link_ebook}}', coalesce(mr.ebook_url, '')),
    '{{link_guia}}', coalesce(nullif(mr.offer->>'guide_url', ''), '')),
    '{{link_reuniao}}', coalesce(nullif(mr.offer->>'meeting_url', ''),
        case when coalesce((o.booking->>'enabled')::boolean, false) and v_base <> '' then v_base || '/b/' || o.public_slug end,
        mr.result_url || '#reuniao', '')),
    '{{area}}', coalesce(lower(c.area), 'o teu negócio')),
    '{{nome}}', coalesce(c.name, '')),
    '{{primeiro_nome}}', coalesce(split_part(c.name, ' ', 1), '')),
    '{{empresa}}', coalesce(v_company, 'a vossa empresa')),
    '{{produto}}', coalesce(v_product, 'o nosso trabalho')),
    '{{negocio}}', coalesce(v_deal, '')),
    '{{meu_nome}}', coalesce(split_part(v_me, ' ', 1), ''));
end $$;

drop function if exists public_magnet_submit(text, text, text, text, text, jsonb, jsonb, int, text, boolean, text, text);
create or replace function public_magnet_submit(p_org text, p_slug text, p_name text, p_email text, p_phone text,
  p_answers jsonb, p_scores jsonb, p_total int, p_weakest text, p_consent boolean, p_base text, p_honeypot text, p_area text default null)
returns uuid
language plpgsql security definer set search_path = p360, public as $$
declare m lead_magnets%rowtype; o organizations%rowtype; v_owner uuid; v_contact uuid; v_deal uuid; v_pipe uuid; v_stage uuid;
  v_prod products%rowtype; v_rid uuid := gen_random_uuid(); v_base text; v_recent int; v_email text; v_phone text; v_digits text;
  v_summary text; v_body text; v_subject text; v_area text;
begin
  if coalesce(p_honeypot, '') <> '' then return null; end if;
  v_email := lower(trim(coalesce(p_email, '')));
  if v_email <> '' and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Esse email não parece válido'; end if;
  v_phone := nullif(left(trim(coalesce(p_phone, '')), 40), '');
  v_digits := regexp_replace(coalesce(v_phone, ''), '\D', '', 'g');
  if v_phone is not null and length(v_digits) < 9 then raise exception 'Esse número não parece válido'; end if;
  v_area := nullif(left(trim(coalesce(p_area, '')), 80), '');
  if coalesce(trim(p_name), '') = '' then raise exception 'Diz-me o teu nome'; end if;
  select * into o from organizations where public_slug = lower(p_org);
  if not found then raise exception 'Página indisponível'; end if;
  select * into m from lead_magnets where org_id = o.id and slug = lower(p_slug) and active;
  if not found then raise exception 'Página indisponível'; end if;
  if m.kind = 'guide' and v_phone is null and v_email = '' then raise exception 'Indica o teu WhatsApp'; end if;
  if m.kind <> 'guide' and v_email = '' and v_phone is null then raise exception 'Indica o teu email ou WhatsApp'; end if;
  if not p_consent and m.kind = 'guide' then raise exception 'Aceita receber o guia para continuar'; end if;
  select count(*) into v_recent from magnet_responses where org_id = o.id and created_at > now() - interval '1 hour';
  if v_recent >= 40 then raise exception 'Demasiados pedidos. Tenta mais tarde.'; end if;
  v_base := rtrim(coalesce(p_base, ''), '/'); if v_base !~ '^https?://' then v_base := ''; end if;
  v_owner := o.created_by;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);

  -- Contacto: reaproveita por email ou pelos últimos 9 dígitos do telemóvel
  if v_email <> '' then select id into v_contact from contacts where org_id = o.id and lower(email) = v_email order by created_at limit 1; end if;
  if v_contact is null and length(v_digits) >= 9 then
    select id into v_contact from contacts where org_id = o.id and right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 9) = right(v_digits, 9) order by created_at limit 1;
  end if;
  if v_contact is null then
    insert into contacts (org_id, name, email, phone, source, area)
    values (o.id, left(trim(p_name), 120), nullif(v_email, ''), v_phone, left('Lead magnet · ' || m.title, 120), v_area)
    returning id into v_contact;
  else
    update contacts set phone = coalesce(phone, v_phone), email = coalesce(email, nullif(v_email, '')), area = coalesce(v_area, area) where id = v_contact;
  end if;
  if p_consent then update contacts set consent_marketing = true, consent_at = now(), unsubscribed_at = null where id = v_contact; end if;

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
  values (v_rid, o.id, m.id, v_contact, v_deal, coalesce(p_answers, '{}'::jsonb) || case when v_area is not null then jsonb_build_object('area', v_area) else '{}'::jsonb end,
          p_scores, case when m.kind = 'quiz' then greatest(0, least(100, p_total)) end, case when m.kind = 'quiz' then left(p_weakest, 60) end,
          case when m.kind = 'quiz' then v_base || '/r/' || v_rid end, v_base || '/e/' || v_rid);

  v_summary := case when m.kind = 'quiz' then m.title || ': ' || p_total || '/100 · mais fraco em: ' || coalesce(p_weakest, '—')
                    else 'Pediu «' || m.title || '»' end || coalesce(' · ' || v_area, '');
  insert into activities (org_id, deal_id, contact_id, type, summary, created_by) values (o.id, v_deal, v_contact, 'note', 'Lead magnet — ' || v_summary, v_owner);
  insert into tasks (org_id, owner_id, title, due_date, deal_id, module)
  values (o.id, v_owner, left(case when m.kind = 'guide' then 'Enviar o guia a ' else 'Contactar ' end || trim(p_name) || ' — ' || v_summary, 300), current_date, v_deal, 'crm');

  -- Primeira mensagem (resultado / guia): fica na fila para aprovares
  if not exists (select 1 from contacts where id = v_contact and unsubscribed_at is not null) then
    if v_phone is not null and coalesce(m.offer->>'whatsapp_body', '') <> '' then
      insert into outbox (org_id, contact_id, deal_id, channel, to_address, subject, body, due_on)
      values (o.id, v_contact, v_deal, 'whatsapp', v_phone, null, render_template(m.offer->>'whatsapp_body', v_contact, v_deal), current_date);
    end if;
    if v_email <> '' and coalesce(m.offer->>'email_body', '') <> '' then
      v_subject := render_template(coalesce(nullif(m.offer->>'email_subject', ''), 'O teu resultado'), v_contact, v_deal);
      v_body := render_template(m.offer->>'email_body', v_contact, v_deal);
      insert into outbox (org_id, contact_id, deal_id, channel, to_address, subject, body, due_on)
      values (o.id, v_contact, v_deal, 'email', v_email, v_subject, v_body, current_date);
    end if;
  end if;
  if m.sequence_id is not null then perform enroll_contact(m.sequence_id, v_contact, v_deal); end if;
  return v_rid;
end $$;

-- Página pública: devolve também o tema/marca e a oferta (sem dados internos)
create or replace function public_magnet(p_org text, p_slug text) returns jsonb
language plpgsql security definer set search_path = p360, public as $$
declare v jsonb; v_id uuid;
begin
  select m.id, jsonb_build_object('id', m.id, 'kind', m.kind, 'title', m.title, 'subtitle', m.subtitle, 'config', m.config,
      'org', coalesce(o.legal_name, o.name), 'author', coalesce(o.signature_name, pr.full_name, o.name),
      'booking', coalesce((o.booking->>'enabled')::boolean, false), 'slug', o.public_slug,
      'offer', jsonb_build_object('whatsapp', m.offer->>'whatsapp', 'keyword', m.offer->>'keyword', 'guide_url', m.offer->>'guide_url', 'meeting_url', m.offer->>'meeting_url'))
    into v_id, v
  from lead_magnets m join organizations o on o.id = m.org_id left join profiles pr on pr.id = o.created_by
  where o.public_slug = lower(p_org) and m.slug = lower(p_slug) and m.active;
  if v_id is null then return null; end if;
  update lead_magnets set views = views + 1 where id = v_id;
  return v;
end $$;

create or replace function public_magnet_peek(p_org text, p_slug text) returns jsonb
language sql stable security definer set search_path = p360, public as $$
  select jsonb_build_object('kind', m.kind, 'config', m.config, 'title', m.title, 'subtitle', m.subtitle, 'author', coalesce(o.signature_name, pr.full_name, o.name),
    'offer', jsonb_build_object('whatsapp', m.offer->>'whatsapp', 'keyword', m.offer->>'keyword', 'guide_url', m.offer->>'guide_url'))
  from lead_magnets m join organizations o on o.id = m.org_id left join profiles pr on pr.id = o.created_by
  where o.public_slug = lower(p_org) and m.slug = lower(p_slug) and m.active;
$$;

-- Resultado / obrigado: inclui marca, área e contacto de WhatsApp
create or replace function public_magnet_result(p_rid uuid) returns jsonb
language sql stable security definer set search_path = p360, public as $$
  select jsonb_build_object('kind', m.kind, 'title', m.title, 'config', m.config, 'scores', r.scores, 'total', r.total, 'weakest', r.weakest,
    'first_name', split_part(c.name, ' ', 1), 'area', c.area, 'org', coalesce(o.legal_name, o.name), 'author', coalesce(o.signature_name, pr.full_name, o.name),
    'meeting_url', nullif(m.offer->>'meeting_url', ''), 'meeting_label', nullif(m.offer->>'meeting_label', ''),
    'booking_url', case when coalesce((o.booking->>'enabled')::boolean, false) then '/b/' || o.public_slug || '?r=' || r.id end,
    'whatsapp', coalesce(nullif(m.offer->>'whatsapp', ''), regexp_replace(coalesce(pr.phone, ''), '\D', '', 'g')), 'keyword', m.offer->>'keyword',
    'guide_url', nullif(m.offer->>'guide_url', ''), 'guide_title', (select g.title from lead_magnets g where g.org_id = o.id and g.kind = 'guide' and g.active order by g.created_at limit 1),
    'guide_link', (select '/d/' || o.public_slug || '/' || g.slug from lead_magnets g where g.org_id = o.id and g.kind = 'guide' and g.active order by g.created_at limit 1),
    'quiz_link', (select '/d/' || o.public_slug || '/' || q.slug from lead_magnets q where q.org_id = o.id and q.kind = 'quiz' and q.active order by (q.config ? 'landing') desc, q.created_at limit 1),
    'phone', pr.phone, 'email', coalesce(nullif(o.settings->'email'->>'reply_to', ''), nullif(o.settings->'email'->>'from_email', ''), 'geral@thomasfaria.pt'),
    'has_ebook', exists (select 1 from lead_magnets e where e.org_id = o.id and e.kind = 'ebook' and e.active))
  from magnet_responses r join lead_magnets m on m.id = r.magnet_id join organizations o on o.id = r.org_id
  left join contacts c on c.id = r.contact_id left join profiles pr on pr.id = o.created_by
  where r.id = p_rid;
$$;

grant execute on function public_magnet_submit(text, text, text, text, text, jsonb, jsonb, int, text, boolean, text, text, text),
  public_magnet(text, text), public_magnet_peek(text, text), public_magnet_result(uuid) to anon, authenticated;
revoke execute on function render_template(text, uuid, uuid) from anon, authenticated, public;
