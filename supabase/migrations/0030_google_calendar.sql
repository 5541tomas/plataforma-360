set search_path = p360, public, extensions;

-- =====================================================================
-- AGENDA ↔ GOOGLE CALENDAR (sincronização feita pelo servidor com a chave interna)
-- =====================================================================
create table if not exists calendar_busy (
  org_id    uuid not null references organizations(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at   timestamptz not null
);
create index if not exists calendar_busy_org on calendar_busy(org_id, starts_at);
alter table calendar_busy enable row level security;
drop policy if exists cb_read on calendar_busy;
create policy cb_read on calendar_busy for select using (can_read(org_id, 'crm'));

alter table bookings add column if not exists google_event_id text, add column if not exists meet_url text;
alter table integrations add column if not exists calendar_synced_at timestamptz, add column if not exists calendar_error text;

-- Horários ocupados = marcações + calendário Google
create or replace function public_booking_info(p_org text) returns jsonb
language sql stable security definer set search_path = p360, public as $$
  select jsonb_build_object('org', coalesce(o.legal_name, o.name), 'author', coalesce(o.signature_name, pr.full_name, o.name), 'booking', o.booking,
    'busy', coalesce((select jsonb_agg(x) from (
        select jsonb_build_array(b.starts_at, b.ends_at) x from bookings b where b.org_id = o.id and b.status = 'confirmed' and b.ends_at > now() and b.starts_at < now() + interval '90 days'
        union all
        select jsonb_build_array(c.starts_at, c.ends_at) from calendar_busy c where c.org_id = o.id and c.ends_at > now()) t), '[]'::jsonb))
  from organizations o left join profiles pr on pr.id = o.created_by
  where o.public_slug = lower(p_org) and coalesce((o.booking->>'enabled')::boolean, false);
$$;

create or replace function public_book(p_org text, p_start timestamptz, p_name text, p_email text, p_phone text, p_notes text, p_rid uuid, p_base text, p_honeypot text)
returns uuid
language plpgsql security definer set search_path = p360, public as $$
declare o organizations%rowtype; cfg jsonb; v_dur int; v_end timestamptz; v_email text; v_contact uuid; v_deal uuid; v_pipe uuid; v_stage uuid; v_meet uuid;
  v_prod products%rowtype; v_id uuid := gen_random_uuid(); v_owner uuid; v_local timestamp; v_dow int; v_when text; v_base text; v_recent int;
begin
  if coalesce(p_honeypot, '') <> '' then return null; end if;
  v_email := lower(trim(coalesce(p_email, '')));
  if coalesce(trim(p_name), '') = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Indica o teu nome e um email válido'; end if;
  select * into o from organizations where public_slug = lower(p_org) and coalesce((booking->>'enabled')::boolean, false);
  if not found then raise exception 'Agenda indisponível'; end if;
  cfg := o.booking;
  v_dur := coalesce((cfg->>'duration')::int, 30);
  v_end := p_start + make_interval(mins => v_dur);
  v_local := p_start at time zone 'Europe/Lisbon';
  v_dow := extract(isodow from v_local)::int;
  if p_start < now() + make_interval(hours => coalesce((cfg->>'notice_hours')::int, 12)) then raise exception 'Esse horário já não está disponível. Escolhe outro.'; end if;
  if p_start > now() + make_interval(days => coalesce((cfg->>'horizon_days')::int, 21) + 1) then raise exception 'Data demasiado distante.'; end if;
  if not (coalesce(cfg->'days', '[1,2,3,4,5]'::jsonb) @> to_jsonb(v_dow)) then raise exception 'Nesse dia não há marcações.'; end if;
  if v_local::time < coalesce(cfg->>'start', '09:30')::time or (v_local + make_interval(mins => v_dur))::time > coalesce(cfg->>'end', '18:00')::time then raise exception 'Fora do horário disponível.'; end if;
  select count(*) into v_recent from bookings where org_id = o.id and created_at > now() - interval '1 hour';
  if v_recent >= 20 then raise exception 'Demasiados pedidos. Tenta mais tarde.'; end if;
  perform pg_advisory_xact_lock(hashtext(o.id::text));
  if exists (select 1 from bookings b where b.org_id = o.id and b.status = 'confirmed'
             and tstzrange(b.starts_at, b.ends_at + make_interval(mins => coalesce((cfg->>'buffer')::int, 0))) && tstzrange(p_start, v_end)) then
    raise exception 'Alguém acabou de marcar esse horário. Escolhe outro, por favor.';
  end if;
  if exists (select 1 from calendar_busy cb where cb.org_id = o.id and tstzrange(cb.starts_at, cb.ends_at) && tstzrange(p_start, v_end)) then
    raise exception 'Esse horário acabou de ficar ocupado. Escolhe outro, por favor.';
  end if;
  v_owner := o.created_by;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  v_base := rtrim(coalesce(p_base, ''), '/'); if v_base !~ '^https?://' then v_base := ''; end if;

  select id into v_contact from contacts where org_id = o.id and lower(email) = v_email order by created_at limit 1;
  if v_contact is null and p_rid is not null then select contact_id into v_contact from magnet_responses where id = p_rid and org_id = o.id; end if;
  if v_contact is null then
    insert into contacts (org_id, name, email, phone, source) values (o.id, left(trim(p_name), 120), v_email, nullif(left(trim(coalesce(p_phone, '')), 40), ''), 'Agenda online')
    returning id into v_contact;
  else
    update contacts set phone = coalesce(phone, nullif(left(trim(coalesce(p_phone, '')), 40), '')), email = coalesce(email, v_email) where id = v_contact;
  end if;

  select id into v_deal from deals where contact_id = v_contact and status = 'open' order by created_at desc limit 1;
  select id into v_pipe from pipelines where org_id = o.id order by position limit 1;
  if v_deal is null then
    select * into v_prod from products where org_id = o.id and active and (name ilike '%1:1%' or name ilike '%individual%') order by position limit 1;
    select id into v_stage from stages where pipeline_id = v_pipe and not is_won and not is_lost order by position limit 1;
    insert into deals (org_id, pipeline_id, stage_id, contact_id, owner_id, title, kind, value, product_id, source)
    values (o.id, v_pipe, v_stage, v_contact, v_owner, coalesce(v_prod.name, 'Reunião 1:1') || ' — ' || left(trim(p_name), 80), coalesce(v_prod.kind, 'one_off'), coalesce(v_prod.price, 0), v_prod.id, 'Agenda online')
    returning id into v_deal;
  end if;
  -- Avança para a etapa de reunião (se existir e o negócio estiver antes dela)
  select s.id into v_meet from deals d join stages s on s.pipeline_id = d.pipeline_id
    where d.id = v_deal and not s.is_won and not s.is_lost and (s.name ilike '%reuni%' or s.name ilike '%diagn%' or s.name ilike '%qualifica%')
      and s.position > (select position from stages where id = d.stage_id) order by s.position limit 1;
  if v_meet is not null then update deals set stage_id = v_meet where id = v_deal; end if;

  insert into bookings (id, org_id, contact_id, deal_id, response_id, starts_at, ends_at, name, email, phone, notes)
  values (v_id, o.id, v_contact, v_deal, p_rid, p_start, v_end, left(trim(p_name), 120), v_email, nullif(left(trim(coalesce(p_phone, '')), 40), ''), nullif(left(coalesce(p_notes, ''), 2000), ''));

  v_when := to_char(v_local, 'DD/MM "às" HH24:MI');
  insert into activities (org_id, deal_id, contact_id, type, summary, created_by)
  values (o.id, v_deal, v_contact, 'meeting', 'Reunião 1:1 marcada online para ' || v_when || coalesce(' — ' || nullif(left(p_notes, 500), ''), ''), v_owner);
  insert into tasks (org_id, owner_id, title, due_date, deal_id, module)
  values (o.id, v_owner, 'Reunião 1:1 com ' || left(trim(p_name), 80) || ' às ' || to_char(v_local, 'HH24:MI') || ' — preparar', v_local::date, v_deal, 'crm');
  -- Email de confirmação: fica na fila para aprovares
  insert into outbox (org_id, contact_id, deal_id, channel, to_address, subject, body, due_on)
  values (o.id, v_contact, v_deal, 'email', v_email, 'Reunião confirmada: ' || to_char(v_local, 'DD/MM, HH24:MI'),
    'Olá ' || split_part(trim(p_name), ' ', 1) || ',' || chr(10) || chr(10) || 'A nossa reunião 1:1 ficou marcada para ' || v_when || ' (hora de Lisboa), com a duração de ' || v_dur || ' minutos.' || chr(10) || chr(10)
    || coalesce('Local: ' || nullif(cfg->>'location', '') || chr(10), '') || coalesce('Link: ' || nullif(cfg->>'meet_url', '') || chr(10), '')
    || chr(10) || 'Podes adicionar ao teu calendário ou cancelar aqui:' || chr(10) || v_base || '/m/' || v_id || chr(10) || chr(10)
    || 'Para aproveitarmos bem o tempo, pensa em duas coisas: o que te fez marcar esta conversa e o que tem de mudar nos próximos 90 dias.' || chr(10) || chr(10)
    || 'Até breve,' || chr(10) || split_part(coalesce(o.signature_name, o.name), ' ', 1), current_date);
  return v_id;
end $$;

-- O que há para sincronizar (credenciais do dono + marcações a criar/apagar no Google)
create or replace function calendar_job(p_secret text) returns jsonb
language plpgsql security definer set search_path = p360, public as $$
declare v_org uuid; o organizations%rowtype; i integrations%rowtype;
begin
  v_org := org_of_secret(p_secret);
  if v_org is null then raise exception 'Sem permissão'; end if;
  select * into o from organizations where id = v_org;
  select * into i from integrations where org_id = v_org and user_id = o.created_by and provider = 'google';
  if i.refresh_token is null then return jsonb_build_object('connected', false); end if;
  return jsonb_build_object('connected', true, 'refresh_token', i.refresh_token, 'horizon', coalesce((o.booking->>'horizon_days')::int, 21) + 7,
    'title', coalesce(nullif(o.booking->>'title', ''), 'Reunião 1:1'), 'location', o.booking->>'location', 'meet_url', nullif(o.booking->>'meet_url', ''),
    'create', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'start', b.starts_at, 'end', b.ends_at, 'name', b.name, 'email', b.email, 'phone', b.phone, 'notes', b.notes))
       from bookings b where b.org_id = v_org and b.status = 'confirmed' and b.google_event_id is null and b.ends_at > now()), '[]'::jsonb),
    'delete', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'event', b.google_event_id))
       from bookings b where b.org_id = v_org and b.status = 'cancelled' and b.google_event_id is not null), '[]'::jsonb));
end $$;

create or replace function calendar_save(p_secret text, p_busy jsonb, p_created jsonb, p_deleted uuid[], p_error text) returns void
language plpgsql security definer set search_path = p360, public as $$
declare v_org uuid; e jsonb;
begin
  v_org := org_of_secret(p_secret);
  if v_org is null then raise exception 'Sem permissão'; end if;
  if p_busy is not null then
    delete from calendar_busy where org_id = v_org;
    insert into calendar_busy (org_id, starts_at, ends_at)
    select v_org, (x->>'start')::timestamptz, (x->>'end')::timestamptz from jsonb_array_elements(p_busy) x;
  end if;
  for e in select * from jsonb_array_elements(coalesce(p_created, '[]'::jsonb)) loop
    update bookings set google_event_id = e->>'event', meet_url = coalesce(nullif(e->>'meet', ''), meet_url) where id = (e->>'id')::uuid and org_id = v_org;
  end loop;
  update bookings set google_event_id = null where org_id = v_org and id = any(coalesce(p_deleted, '{}'));
  update integrations set calendar_synced_at = now(), calendar_error = p_error
  where org_id = v_org and provider = 'google' and user_id = (select created_by from organizations where id = v_org);
end $$;

-- A página da reunião mostra o link do Meet criado no Google
create or replace function public_booking_get(p_id uuid) returns jsonb
language sql stable security definer set search_path = p360, public as $$
  select jsonb_build_object('id', b.id, 'starts_at', b.starts_at, 'ends_at', b.ends_at, 'name', b.name, 'status', b.status,
    'org', coalesce(o.legal_name, o.name), 'author', coalesce(o.signature_name, pr.full_name, o.name), 'slug', o.public_slug,
    'location', o.booking->>'location', 'meet_url', coalesce(b.meet_url, o.booking->>'meet_url'), 'title', coalesce(nullif(o.booking->>'title', ''), 'Reunião 1:1'))
  from bookings b join organizations o on o.id = b.org_id left join profiles pr on pr.id = o.created_by where b.id = p_id;
$$;

grant select on calendar_busy to authenticated, service_role;
grant execute on function calendar_job(text), calendar_save(text, jsonb, jsonb, uuid[], text), public_booking_info(text), public_booking_get(uuid),
  public_book(text, timestamptz, text, text, text, text, uuid, text, text) to anon, authenticated;
