set search_path = p360, public, extensions;

-- =====================================================================
-- AGENDA DE MARCAÇÕES: reuniões 1:1 marcadas pelo cliente, sem ferramentas externas
-- =====================================================================
alter table organizations add column if not exists booking jsonb not null default '{}'::jsonb;
-- {enabled, duration, buffer, days:[1..7], start:"09:30", end:"18:00", notice_hours, horizon_days, title, intro, location, meet_url}

create table if not exists bookings (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  contact_id  uuid references contacts(id) on delete set null,
  deal_id     uuid references deals(id) on delete set null,
  response_id uuid references magnet_responses(id) on delete set null,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  name        text not null,
  email       text not null,
  phone       text,
  notes       text,
  status      text not null default 'confirmed' check (status in ('confirmed', 'cancelled', 'done', 'no_show')),
  created_at  timestamptz not null default now()
);
create index if not exists bookings_org_time on bookings(org_id, starts_at);
alter table bookings enable row level security;
drop policy if exists bk_read on bookings; drop policy if exists bk_write on bookings;
create policy bk_read on bookings for select using (can_read(org_id, 'crm'));
create policy bk_write on bookings for all using (can_write(org_id, 'crm')) with check (can_write(org_id, 'crm'));

-- Informação pública da agenda + horários ocupados (sem dados pessoais)
create or replace function public_booking_info(p_org text) returns jsonb
language sql stable security definer set search_path = p360, public as $$
  select jsonb_build_object('org', coalesce(o.legal_name, o.name), 'author', coalesce(o.signature_name, pr.full_name, o.name), 'booking', o.booking,
    'busy', coalesce((select jsonb_agg(jsonb_build_array(b.starts_at, b.ends_at)) from bookings b
                      where b.org_id = o.id and b.status = 'confirmed' and b.ends_at > now() and b.starts_at < now() + interval '90 days'), '[]'::jsonb))
  from organizations o left join profiles pr on pr.id = o.created_by
  where o.public_slug = lower(p_org) and coalesce((o.booking->>'enabled')::boolean, false);
$$;

-- Marcar: valida o horário, cria/reaproveita contacto e negócio, avança o negócio para "Reunião", regista e cria tarefa
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

-- Página da reunião (o id funciona como chave) e cancelamento
create or replace function public_booking_get(p_id uuid) returns jsonb
language sql stable security definer set search_path = p360, public as $$
  select jsonb_build_object('id', b.id, 'starts_at', b.starts_at, 'ends_at', b.ends_at, 'name', b.name, 'status', b.status,
    'org', coalesce(o.legal_name, o.name), 'author', coalesce(o.signature_name, pr.full_name, o.name), 'slug', o.public_slug,
    'location', o.booking->>'location', 'meet_url', o.booking->>'meet_url', 'title', coalesce(nullif(o.booking->>'title', ''), 'Reunião 1:1'))
  from bookings b join organizations o on o.id = b.org_id left join profiles pr on pr.id = o.created_by where b.id = p_id;
$$;

create or replace function public_booking_cancel(p_id uuid) returns void
language plpgsql security definer set search_path = p360, public as $$
declare b bookings%rowtype; v_owner uuid;
begin
  select * into b from bookings where id = p_id and status = 'confirmed' and starts_at > now();
  if not found then return; end if;
  select created_by into v_owner from organizations where id = b.org_id;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  update bookings set status = 'cancelled' where id = p_id;
  insert into activities (org_id, deal_id, contact_id, type, summary, created_by)
  values (b.org_id, b.deal_id, b.contact_id, 'note', 'O cliente cancelou a reunião de ' || to_char(b.starts_at at time zone 'Europe/Lisbon', 'DD/MM HH24:MI'), v_owner);
  insert into tasks (org_id, owner_id, title, due_date, deal_id, module)
  values (b.org_id, v_owner, 'Reagendar reunião cancelada: ' || b.name, current_date, b.deal_id, 'crm');
end $$;

-- Resultado do lead magnet: indica se há agenda própria
create or replace function public_magnet_result(p_rid uuid) returns jsonb
language sql stable security definer set search_path = p360, public as $$
  select jsonb_build_object('kind', m.kind, 'title', m.title, 'config', m.config, 'scores', r.scores, 'total', r.total, 'weakest', r.weakest,
    'first_name', split_part(c.name, ' ', 1), 'org', coalesce(o.legal_name, o.name), 'author', coalesce(o.signature_name, pr.full_name, o.name),
    'meeting_url', nullif(m.offer->>'meeting_url', ''), 'meeting_label', nullif(m.offer->>'meeting_label', ''),
    'booking_url', case when coalesce((o.booking->>'enabled')::boolean, false) then '/b/' || o.public_slug || '?r=' || r.id end,
    'phone', pr.phone, 'email', coalesce(nullif(o.settings->'email'->>'reply_to', ''), nullif(o.settings->'email'->>'from_email', ''), 'geral@thomasfaria.pt'),
    'has_ebook', exists (select 1 from lead_magnets e where e.org_id = o.id and e.kind = 'ebook' and e.active))
  from magnet_responses r join lead_magnets m on m.id = r.magnet_id join organizations o on o.id = r.org_id
  left join contacts c on c.id = r.contact_id left join profiles pr on pr.id = o.created_by
  where r.id = p_rid;
$$;

grant select, insert, update, delete on bookings to authenticated, service_role;
grant execute on function public_booking_info(text), public_book(text, timestamptz, text, text, text, text, uuid, text, text),
  public_booking_get(uuid), public_booking_cancel(uuid), public_magnet_result(uuid) to anon, authenticated;

-- Leitura do lead magnet sem contar visita (inclui título para a imagem de partilha)
create or replace function public_magnet_peek(p_org text, p_slug text) returns jsonb
language sql stable security definer set search_path = p360, public as $$
  select jsonb_build_object('kind', m.kind, 'config', m.config, 'title', m.title, 'subtitle', m.subtitle, 'author', coalesce(o.signature_name, pr.full_name, o.name))
  from lead_magnets m join organizations o on o.id = m.org_id left join profiles pr on pr.id = o.created_by
  where o.public_slug = lower(p_org) and m.slug = lower(p_slug) and m.active;
$$;
