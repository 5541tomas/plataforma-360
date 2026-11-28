set search_path = p360, public, extensions;

-- =====================================================================
-- CRESCIMENTO: eventos, testemunhos, recomendações e objeções
-- =====================================================================

-- ---------- Eventos / workshops ----------
create table if not exists events (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  slug        text not null,
  title       text not null,
  subtitle    text,
  description text,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  location    text,
  online_url  text,
  capacity    int,
  price_label text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (org_id, slug)
);
create table if not exists event_registrations (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  org_id      uuid not null references organizations(id) on delete cascade,
  contact_id  uuid references contacts(id) on delete set null,
  deal_id     uuid references deals(id) on delete set null,
  name        text not null,
  email       text,
  phone       text,
  status      text not null default 'registered' check (status in ('registered', 'attended', 'no_show', 'cancelled')),
  notified_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists ev_reg_event on event_registrations(event_id);
alter table events enable row level security;
alter table event_registrations enable row level security;
drop policy if exists ev_read on events; drop policy if exists ev_write on events;
create policy ev_read on events for select using (can_read(org_id, 'crm'));
create policy ev_write on events for all using (can_write(org_id, 'crm')) with check (can_write(org_id, 'crm'));
drop policy if exists evr_read on event_registrations; drop policy if exists evr_write on event_registrations;
create policy evr_read on event_registrations for select using (can_read(org_id, 'crm'));
create policy evr_write on event_registrations for all using (can_write(org_id, 'crm')) with check (can_write(org_id, 'crm'));
grant select, insert, update, delete on events, event_registrations to authenticated;

create or replace function public_event(p_org text, p_slug text) returns jsonb
language sql stable security definer set search_path = p360, public as $$
  select jsonb_build_object('id', e.id, 'title', e.title, 'subtitle', e.subtitle, 'description', e.description, 'starts_at', e.starts_at, 'ends_at', e.ends_at,
    'location', e.location, 'capacity', e.capacity, 'price_label', e.price_label, 'author', coalesce(o.signature_name, pr.full_name, o.name), 'org', coalesce(o.legal_name, o.name),
    'taken', (select count(*) from event_registrations r where r.event_id = e.id and r.status <> 'cancelled'), 'past', e.ends_at < now(),
    'pixel', nullif(o.settings->'pixel'->>'meta', ''))
  from events e join organizations o on o.id = e.org_id left join profiles pr on pr.id = o.created_by
  where o.public_slug = lower(p_org) and e.slug = lower(p_slug) and e.active;
$$;

create or replace function public_event_register(p_org text, p_slug text, p_name text, p_email text, p_phone text, p_consent boolean, p_honeypot text, p_utm jsonb default null)
returns uuid
language plpgsql security definer set search_path = p360, public as $$
declare o organizations%rowtype; e events%rowtype; v_email text; v_phone text; v_contact uuid; v_deal uuid; v_id uuid := gen_random_uuid();
  v_taken int; v_recent int; v_pipe uuid; v_stage uuid; v_when text; v_channel text;
begin
  if coalesce(p_honeypot, '') <> '' then return null; end if;
  v_email := lower(trim(coalesce(p_email, '')));
  if coalesce(trim(p_name), '') = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Indica o teu nome e um email válido'; end if;
  v_phone := nullif(left(trim(coalesce(p_phone, '')), 40), '');
  select * into o from organizations where public_slug = lower(p_org);
  if not found then raise exception 'Evento indisponível'; end if;
  select * into e from events where org_id = o.id and slug = lower(p_slug) and active;
  if not found or e.ends_at < now() then raise exception 'As inscrições para este evento já fecharam'; end if;
  select count(*) into v_taken from event_registrations where event_id = e.id and status <> 'cancelled';
  if e.capacity is not null and v_taken >= e.capacity then raise exception 'Lotação esgotada. Responde ao email para ficares em lista de espera.'; end if;
  select count(*) into v_recent from event_registrations where org_id = o.id and created_at > now() - interval '1 hour';
  if v_recent >= 60 then raise exception 'Demasiados pedidos. Tenta mais tarde.'; end if;
  if exists (select 1 from event_registrations where event_id = e.id and lower(email) = v_email and status <> 'cancelled') then
    select id into v_id from event_registrations where event_id = e.id and lower(email) = v_email and status <> 'cancelled' limit 1;
    return v_id;
  end if;
  v_channel := nullif(lower(left(trim(coalesce(p_utm->>'source', '')), 40)), '');
  perform set_config('request.jwt.claim.sub', o.created_by::text, true);
  select id into v_contact from contacts where org_id = o.id and lower(email) = v_email order by created_at limit 1;
  if v_contact is null then
    insert into contacts (org_id, name, email, phone, source, channel) values (o.id, left(trim(p_name), 120), v_email, v_phone, left('Evento · ' || e.title, 120), coalesce(v_channel, 'direto')) returning id into v_contact;
  else
    update contacts set phone = coalesce(phone, v_phone) where id = v_contact;
  end if;
  if p_consent then update contacts set consent_marketing = true, consent_at = now(), unsubscribed_at = null where id = v_contact; end if;
  select id into v_deal from deals where contact_id = v_contact and status = 'open' order by created_at desc limit 1;
  if v_deal is null then
    select id into v_pipe from pipelines where org_id = o.id order by position limit 1;
    select id into v_stage from stages where pipeline_id = v_pipe and not is_won and not is_lost order by position limit 1;
    insert into deals (org_id, pipeline_id, stage_id, contact_id, owner_id, title, kind, value, source)
    values (o.id, v_pipe, v_stage, v_contact, o.created_by, left(e.title || ' — ' || trim(p_name), 200), 'one_off', 0, 'Evento') returning id into v_deal;
  end if;
  insert into event_registrations (id, event_id, org_id, contact_id, deal_id, name, email, phone) values (v_id, e.id, o.id, v_contact, v_deal, left(trim(p_name), 120), v_email, v_phone);
  insert into activities (org_id, deal_id, contact_id, type, summary, created_by) values (o.id, v_deal, v_contact, 'note', 'Inscreveu-se em «' || e.title || '»', o.created_by);
  -- Lembrete na véspera (fica na fila para aprovares)
  v_when := to_char(e.starts_at at time zone 'Europe/Lisbon', 'DD/MM "às" HH24:MI');
  if e.starts_at > now() + interval '30 hours' then
    insert into outbox (org_id, contact_id, deal_id, channel, to_address, subject, body, due_on)
    values (o.id, v_contact, v_deal, 'email', v_email, 'Amanhã: ' || e.title,
      'Olá ' || split_part(trim(p_name), ' ', 1) || E',\n\nSó para lembrar: amanhã, ' || v_when || ', é o «' || e.title || E'».\n\n' ||
      coalesce(case when e.online_url is not null then 'Link para entrar: ' || e.online_url else 'Local: ' || e.location end, '') ||
      E'\n\nAté amanhã,\n' || coalesce(o.signature_name, o.name), ((e.starts_at at time zone 'Europe/Lisbon')::date - 1));
  end if;
  return v_id;
end $$;

create or replace function public_event_registration(p_id uuid) returns jsonb
language sql stable security definer set search_path = p360, public as $$
  select jsonb_build_object('id', r.id, 'name', r.name, 'title', e.title, 'starts_at', e.starts_at, 'ends_at', e.ends_at, 'location', e.location, 'online_url', e.online_url,
    'author', coalesce(o.signature_name, o.name), 'pixel', nullif(o.settings->'pixel'->>'meta', ''))
  from event_registrations r join events e on e.id = r.event_id join organizations o on o.id = r.org_id where r.id = p_id;
$$;

create or replace function public_event_after(p_id uuid) returns jsonb
language plpgsql security definer set search_path = p360, public as $$
declare r event_registrations%rowtype; o organizations%rowtype; e events%rowtype;
begin
  update event_registrations set notified_at = now() where id = p_id and notified_at is null and created_at > now() - interval '15 minutes' returning * into r;
  if not found then return null; end if;
  select * into o from organizations where id = r.org_id;
  select * into e from events where id = r.event_id;
  if not coalesce((o.settings->'notify'->>'leads')::boolean, true) then return null; end if;
  return jsonb_build_object('alert', jsonb_build_object('to', owner_alert_email(o.id), 'name', r.name, 'email', r.email, 'phone', r.phone, 'event', e.title,
    'taken', (select count(*) from event_registrations x where x.event_id = e.id and x.status <> 'cancelled'), 'capacity', e.capacity, 'deal_id', r.deal_id, 'contact_id', r.contact_id), 'sender', sender_of(o));
end $$;

-- ---------- Testemunhos ----------
create table if not exists testimonials (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  contact_id   uuid references contacts(id) on delete set null,
  deal_id      uuid references deals(id) on delete set null,
  token        uuid not null unique default gen_random_uuid(),
  name         text,
  role         text,
  company      text,
  text         text,
  rating       int check (rating between 1 and 5),
  permission   boolean not null default false,
  status       text not null default 'requested' check (status in ('requested', 'submitted', 'approved', 'rejected')),
  submitted_at timestamptz,
  created_at   timestamptz not null default now()
);
alter table testimonials enable row level security;
drop policy if exists tm_read on testimonials; drop policy if exists tm_write on testimonials;
create policy tm_read on testimonials for select using (can_read(org_id, 'crm'));
create policy tm_write on testimonials for all using (can_write(org_id, 'crm')) with check (can_write(org_id, 'crm'));
grant select, insert, update, delete on testimonials to authenticated;

create or replace function public_testimonial(p_token uuid) returns jsonb
language sql stable security definer set search_path = p360, public as $$
  select jsonb_build_object('name', coalesce(t.name, c.name), 'company', coalesce(t.company, co.name), 'role', t.role, 'status', t.status, 'product', d.title,
    'author', coalesce(o.signature_name, o.name), 'org', coalesce(o.legal_name, o.name))
  from testimonials t join organizations o on o.id = t.org_id left join contacts c on c.id = t.contact_id left join companies co on co.id = c.company_id left join deals d on d.id = t.deal_id
  where t.token = p_token;
$$;

create or replace function public_testimonial_submit(p_token uuid, p_name text, p_role text, p_company text, p_text text, p_rating int, p_permission boolean) returns boolean
language plpgsql security definer set search_path = p360, public as $$
declare t testimonials%rowtype;
begin
  select * into t from testimonials where token = p_token;
  if not found then raise exception 'Link inválido'; end if;
  if t.status in ('approved') then raise exception 'Este testemunho já foi publicado. Obrigado!'; end if;
  if length(trim(coalesce(p_text, ''))) < 15 then raise exception 'Escreve pelo menos uma frase'; end if;
  update testimonials set name = left(nullif(trim(p_name), ''), 120), role = left(nullif(trim(p_role), ''), 120), company = left(nullif(trim(p_company), ''), 120),
    text = left(trim(p_text), 1500), rating = case when p_rating between 1 and 5 then p_rating end, permission = coalesce(p_permission, false), status = 'submitted', submitted_at = now()
  where id = t.id;
  insert into activities (org_id, deal_id, contact_id, type, summary, created_by)
  select t.org_id, t.deal_id, t.contact_id, 'note', 'Deixou um testemunho' || case when p_rating between 1 and 5 then ' (' || p_rating || '/5)' else '' end, o.created_by from organizations o where o.id = t.org_id;
  return true;
end $$;

-- ---------- Recomendações ----------
alter table contacts add column if not exists ref_code text, add column if not exists referred_by uuid references contacts(id) on delete set null;
create unique index if not exists contacts_ref_code on contacts(org_id, ref_code) where ref_code is not null;

create or replace function contact_ref_code(p_contact uuid) returns text
language plpgsql security definer set search_path = p360, public as $$
declare v_code text; v_org uuid; v_name text;
begin
  select org_id, ref_code, name into v_org, v_code, v_name from contacts where id = p_contact;
  if v_org is null or not can_write(v_org, 'crm') then raise exception 'Sem permissão'; end if;
  if v_code is not null then return v_code; end if;
  loop
    v_code := lower(left(regexp_replace(translate(split_part(coalesce(v_name, 'amigo'), ' ', 1), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'), '[^a-zA-Z]', '', 'g'), 10)) || '-' || substr(md5(random()::text), 1, 4);
    begin
      update contacts set ref_code = v_code where id = p_contact;
      return v_code;
    exception when unique_violation then null;
    end;
  end loop;
end $$;

-- Liga a lead nova a quem a recomendou (corre logo depois do pedido)
create or replace function apply_referral(p_rid uuid) returns void
language plpgsql security definer set search_path = p360, public as $$
declare r magnet_responses%rowtype; v_ref uuid;
begin
  select * into r from magnet_responses where id = p_rid;
  if r.id is null or coalesce(r.answers->'utm'->>'ref', '') = '' then return; end if;
  select id into v_ref from contacts where org_id = r.org_id and ref_code = lower(r.answers->'utm'->>'ref') and id <> r.contact_id;
  if v_ref is null then return; end if;
  update contacts set referred_by = coalesce(referred_by, v_ref), channel = case when coalesce(channel, 'direto') = 'direto' then 'referencia' else channel end where id = r.contact_id;
  update deals set referred_by = coalesce(referred_by, v_ref) where id = r.deal_id;
  insert into activities (org_id, deal_id, contact_id, type, summary, created_by)
  select r.org_id, r.deal_id, r.contact_id, 'note', 'Recomendado por ' || c.name, o.created_by from contacts c, organizations o where c.id = v_ref and o.id = r.org_id;
end $$;
revoke execute on function apply_referral(uuid) from anon, authenticated, public;

-- O pós-pedido passa a aplicar a recomendação (?ref=)
create or replace function public_magnet_after(p_rid uuid, p_send boolean default true) returns jsonb
language plpgsql security definer set search_path = p360, public as $$
declare r magnet_responses%rowtype; m lead_magnets%rowtype; o organizations%rowtype; c contacts%rowtype; ob outbox%rowtype; v_mail jsonb; v_alert jsonb;
begin
  update magnet_responses set notified_at = now() where id = p_rid and notified_at is null and created_at > now() - interval '15 minutes' returning * into r;
  if not found then return null; end if;
  select * into m from lead_magnets where id = r.magnet_id;
  select * into o from organizations where id = r.org_id;
  perform apply_referral(p_rid);
  select * into c from contacts where id = r.contact_id;
  if m.sequence2_id is not null and c.email is not null and c.consent_marketing and c.unsubscribed_at is null then
    perform enroll_contact(m.sequence2_id, c.id, r.deal_id);
  end if;
  if p_send and m.kind = 'guide' and coalesce((m.offer->>'auto_email')::boolean, true) then
    update outbox set status = 'sent', sent_at = now(), error = null
      where id = (select id from outbox where org_id = r.org_id and contact_id = r.contact_id and channel = 'email' and status = 'pending'
                  and step_id is null and created_at >= r.created_at - interval '5 seconds' order by created_at limit 1)
      returning * into ob;
    if ob.id is not null then
      v_mail := jsonb_build_object('id', ob.id, 'to', ob.to_address, 'subject', ob.subject, 'body', ob.body);
      insert into activities (org_id, deal_id, contact_id, type, summary, created_by)
      values (r.org_id, ob.deal_id, ob.contact_id, 'note', 'Automático: guia enviado por email — ' || coalesce(ob.subject, ''), o.created_by);
    end if;
  end if;
  if p_send and coalesce((o.settings->'notify'->>'leads')::boolean, true) then
    v_alert := jsonb_build_object('to', owner_alert_email(o.id), 'name', c.name, 'email', c.email, 'phone', c.phone, 'area', c.area, 'channel', c.channel,
      'magnet', m.title, 'kind', m.kind, 'total', r.total, 'weakest', r.weakest, 'deal_id', r.deal_id, 'contact_id', r.contact_id);
  end if;
  return jsonb_build_object('mail', v_mail, 'alert', v_alert, 'sender', sender_of(o));
end $$;

-- ---------- Objeções ----------
create table if not exists objections (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  category   text not null default 'Preço',
  title      text not null,
  meaning    text,
  response   text not null,
  question   text,
  position   int not null default 0,
  used       int not null default 0,
  created_at timestamptz not null default now()
);
alter table objections enable row level security;
drop policy if exists ob_read on objections; drop policy if exists ob_write on objections;
create policy ob_read on objections for select using (can_read(org_id, 'crm'));
create policy ob_write on objections for all using (can_write(org_id, 'crm')) with check (can_write(org_id, 'crm'));
grant select, insert, update, delete on objections to authenticated;

grant execute on function public_event(text, text), public_event_register(text, text, text, text, text, boolean, text, jsonb), public_event_registration(uuid), public_event_after(uuid),
  public_testimonial(uuid), public_testimonial_submit(uuid, text, text, text, text, int, boolean) to anon, authenticated;
grant execute on function contact_ref_code(uuid) to authenticated;
revoke execute on function contact_ref_code(uuid) from anon, public;
