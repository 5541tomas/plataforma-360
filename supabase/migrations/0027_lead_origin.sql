set search_path = p360, public, extensions;

-- =====================================================================
-- ORIGEM DAS LEADS: canal (utm_source) e campanha em cada contacto
-- =====================================================================
alter table contacts add column if not exists channel text, add column if not exists campaign text;
create index if not exists contacts_channel on contacts(org_id, channel);

drop function if exists public_magnet_submit(text, text, text, text, text, jsonb, jsonb, int, text, boolean, text, text);
drop function if exists public_magnet_submit(text, text, text, text, text, jsonb, jsonb, int, text, boolean, text, text, text);
create or replace function public_magnet_submit(p_org text, p_slug text, p_name text, p_email text, p_phone text,
  p_answers jsonb, p_scores jsonb, p_total int, p_weakest text, p_consent boolean, p_base text, p_honeypot text, p_area text default null, p_utm jsonb default null)
returns uuid
language plpgsql security definer set search_path = p360, public as $$
declare m lead_magnets%rowtype; o organizations%rowtype; v_owner uuid; v_contact uuid; v_deal uuid; v_pipe uuid; v_stage uuid;
  v_prod products%rowtype; v_rid uuid := gen_random_uuid(); v_base text; v_recent int; v_email text; v_phone text; v_digits text;
  v_summary text; v_body text; v_subject text; v_area text; v_channel text; v_campaign text;
begin
  if coalesce(p_honeypot, '') <> '' then return null; end if;
  v_email := lower(trim(coalesce(p_email, '')));
  if v_email <> '' and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Esse email não parece válido'; end if;
  v_phone := nullif(left(trim(coalesce(p_phone, '')), 40), '');
  v_digits := regexp_replace(coalesce(v_phone, ''), '\D', '', 'g');
  if v_phone is not null and length(v_digits) < 9 then raise exception 'Esse número não parece válido'; end if;
  v_area := nullif(left(trim(coalesce(p_area, '')), 80), '');
  v_channel := nullif(lower(left(trim(coalesce(p_utm->>'source', '')), 40)), '');
  v_campaign := nullif(left(trim(coalesce(p_utm->>'campaign', '')), 80), '');
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
    insert into contacts (org_id, name, email, phone, source, area, channel, campaign)
    values (o.id, left(trim(p_name), 120), nullif(v_email, ''), v_phone, left('Lead magnet · ' || m.title, 120), v_area, coalesce(v_channel, 'direto'), v_campaign)
    returning id into v_contact;
  else
    update contacts set phone = coalesce(phone, v_phone), email = coalesce(email, nullif(v_email, '')), area = coalesce(v_area, area), channel = coalesce(channel, v_channel), campaign = coalesce(campaign, v_campaign) where id = v_contact;
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
  values (v_rid, o.id, m.id, v_contact, v_deal, coalesce(p_answers, '{}'::jsonb) || case when v_area is not null then jsonb_build_object('area', v_area) else '{}'::jsonb end || case when p_utm is not null then jsonb_build_object('utm', p_utm) else '{}'::jsonb end,
          p_scores, case when m.kind = 'quiz' then greatest(0, least(100, p_total)) end, case when m.kind = 'quiz' then left(p_weakest, 60) end,
          case when m.kind = 'quiz' then v_base || '/r/' || v_rid end, v_base || '/e/' || v_rid);

  v_summary := case when m.kind = 'quiz' then m.title || ': ' || p_total || '/100 · mais fraco em: ' || coalesce(p_weakest, '—')
                    else 'Pediu «' || m.title || '»' end || coalesce(' · ' || v_area, '') || coalesce(' · via ' || v_channel, '');
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

grant execute on function public_magnet_submit(text, text, text, text, text, jsonb, jsonb, int, text, boolean, text, text, text, jsonb) to anon, authenticated;
