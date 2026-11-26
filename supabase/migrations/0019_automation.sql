set search_path = p360, public, extensions;

-- =====================================================================
-- AUTOMAÇÃO DO CRM: sequências de nutrição, fila de aprovação, regras,
-- pontuação de leads, reativação e newsletter.
-- Nada é enviado sem aprovação: o motor só prepara a fila (outbox).
-- =====================================================================

-- Contactos: pontuação, consentimento e cancelamento (RGPD)
alter table contacts
  add column if not exists score int not null default 0,
  add column if not exists consent_marketing boolean not null default false,
  add column if not exists consent_at timestamptz,
  add column if not exists unsubscribed_at timestamptz;

-- Negócios: data de fecho (para reativação de perdidos)
alter table deals add column if not exists closed_at timestamptz;
update deals set closed_at = coalesce(won_at, created_at) where status <> 'open' and closed_at is null;

create or replace function deals_on_stage_change() returns trigger
language plpgsql security definer set search_path = p360, public as $$
declare v_stage stages%rowtype;
begin
  select * into v_stage from stages where id = new.stage_id;
  if v_stage.is_won then new.status := 'won'; new.won_at := coalesce(new.won_at, now());
  elsif v_stage.is_lost then new.status := 'lost';
  else new.status := 'open'; new.won_at := null; end if;
  if new.status <> 'open' and (tg_op = 'INSERT' or old.status is distinct from new.status) then new.closed_at := now(); end if;
  if new.status = 'open' then new.closed_at := null; end if;
  return new;
end $$;

-- Sequências
create table if not exists sequences (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references organizations(id) on delete cascade,
  name                  text not null,
  description           text,
  product_id            uuid references products(id) on delete set null,
  stop_on_stage_change  boolean not null default true,   -- para quando o negócio muda de etapa
  stop_on_reply         boolean not null default true,   -- para quando registas contacto (chamada, reunião, email recebido)
  for_closed_deals      boolean not null default false,  -- reativação / clientes: não para por o negócio estar fechado
  active                boolean not null default true,
  created_at            timestamptz not null default now()
);
create table if not exists sequence_steps (
  id          uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references sequences(id) on delete cascade,
  org_id      uuid not null references organizations(id) on delete cascade,
  position    int not null,
  delay_days  int not null default 0 check (delay_days >= 0),  -- dias depois do passo anterior
  channel     text not null check (channel in ('email', 'whatsapp', 'task')),
  subject     text,
  body        text not null
);
create table if not exists enrollments (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  sequence_id    uuid not null references sequences(id) on delete cascade,
  contact_id     uuid not null references contacts(id) on delete cascade,
  deal_id        uuid references deals(id) on delete set null,
  status         text not null default 'active' check (status in ('active', 'completed', 'stopped')),
  next_step      int not null default 1,
  next_run_at    date not null default current_date,
  stage_at_start uuid,
  stopped_reason text,
  started_at     timestamptz not null default now()
);
create unique index if not exists enrollments_one_active on enrollments (sequence_id, contact_id) where status = 'active';

-- Fila de mensagens (tudo precisa de aprovação)
create table if not exists outbox (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  enrollment_id uuid references enrollments(id) on delete set null,
  step_id       uuid references sequence_steps(id) on delete set null,
  campaign_id   uuid,
  contact_id    uuid references contacts(id) on delete cascade,
  deal_id       uuid references deals(id) on delete set null,
  channel       text not null check (channel in ('email', 'whatsapp')),
  to_address    text,
  subject       text,
  body          text not null,
  status        text not null default 'pending' check (status in ('pending', 'sent', 'skipped', 'failed')),
  due_on        date not null default current_date,
  sent_at       timestamptz,
  opened_at     timestamptz,
  clicked_at    timestamptz,
  error         text,
  created_at    timestamptz not null default now()
);
create index if not exists outbox_org_status on outbox (org_id, status);

-- Regras "quando X → faz Y"
create table if not exists automation_rules (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  name           text not null,
  trigger        text not null check (trigger in ('form_lead', 'stage_enter', 'deal_won', 'deal_lost', 'inactive_days', 'lost_after_days', 'client_every_days')),
  trigger_config jsonb not null default '{}'::jsonb,  -- {stage:"Proposta"} | {days:10}
  action         text not null check (action in ('enroll', 'task', 'move_stage')),
  action_config  jsonb not null default '{}'::jsonb,  -- {sequence_id} | {title, days} | {stage}
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);
create table if not exists rule_log (
  rule_id uuid not null references automation_rules(id) on delete cascade,
  deal_id uuid not null references deals(id) on delete cascade,
  at      timestamptz not null default now()
);
create index if not exists rule_log_idx on rule_log (rule_id, deal_id, at desc);

-- Newsletter
create table if not exists campaigns (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  name       text not null,
  subject    text not null,
  body       text not null,
  segment    jsonb not null default '{}'::jsonb,  -- {audience: leads|clients|all, product_id, source}
  status     text not null default 'draft' check (status in ('draft', 'sent')),
  sent_at    timestamptz,
  created_at timestamptz not null default now()
);

-- RLS: tudo isto é do CRM
do $$ declare t text; begin
  foreach t in array array['sequences','sequence_steps','enrollments','outbox','automation_rules','campaigns'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_read', t);
    execute format('drop policy if exists %I on %I', t || '_write', t);
    execute format('create policy %I on %I for select using (can_read(org_id, ''crm''))', t || '_read', t);
    execute format('create policy %I on %I for all using (can_write(org_id, ''crm'')) with check (can_write(org_id, ''crm''))', t || '_write', t);
  end loop;
end $$;
alter table rule_log enable row level security;

-- ---------------------------------------------------------------------
-- Personalização: {{nome}} {{primeiro_nome}} {{empresa}} {{produto}} {{negocio}} {{meu_nome}}
-- ---------------------------------------------------------------------
create or replace function render_template(p_text text, p_contact uuid, p_deal uuid) returns text
language plpgsql stable security definer set search_path = p360, public as $$
declare c contacts%rowtype; v_company text; v_product text; v_deal text; v_me text; v_org uuid;
begin
  select * into c from contacts where id = p_contact;
  select name into v_company from companies where id = c.company_id;
  select d.title, p.name into v_deal, v_product from deals d left join products p on p.id = d.product_id where d.id = p_deal;
  select coalesce(o.signature_name, pr.full_name, o.name) into v_me from organizations o left join profiles pr on pr.id = o.created_by where o.id = c.org_id;
  return replace(replace(replace(replace(replace(replace(coalesce(p_text, ''),
    '{{nome}}', coalesce(c.name, '')),
    '{{primeiro_nome}}', coalesce(split_part(c.name, ' ', 1), '')),
    '{{empresa}}', coalesce(v_company, 'a vossa empresa')),
    '{{produto}}', coalesce(v_product, 'o nosso trabalho')),
    '{{negocio}}', coalesce(v_deal, '')),
    '{{meu_nome}}', coalesce(split_part(v_me, ' ', 1), ''));
end $$;

-- Inscrever um contacto numa sequência
create or replace function enroll_contact(p_sequence uuid, p_contact uuid, p_deal uuid) returns uuid
language plpgsql security definer set search_path = p360, public as $$
declare v_id uuid; v_org uuid; v_delay int; v_stage uuid;
begin
  select org_id into v_org from sequences where id = p_sequence and active;
  if v_org is null then return null; end if;
  if auth.uid() is not null and not can_write(v_org, 'crm') then raise exception 'Sem permissão'; end if;
  if exists (select 1 from enrollments where sequence_id = p_sequence and contact_id = p_contact and status = 'active') then return null; end if;
  select delay_days into v_delay from sequence_steps where sequence_id = p_sequence order by position limit 1;
  select stage_id into v_stage from deals where id = p_deal;
  insert into enrollments (org_id, sequence_id, contact_id, deal_id, next_step, next_run_at, stage_at_start)
  values (v_org, p_sequence, p_contact, p_deal, 1, current_date + coalesce(v_delay, 0), v_stage)
  returning id into v_id;
  return v_id;
end $$;

-- Executar a ação de uma regra sobre um negócio
create or replace function apply_rule(r automation_rules, p_deal uuid) returns void
language plpgsql security definer set search_path = p360, public as $$
declare d deals%rowtype; v_stage uuid; v_owner uuid;
begin
  select * into d from deals where id = p_deal;
  if not found then return; end if;
  v_owner := coalesce(d.owner_id, (select created_by from organizations where id = d.org_id));
  if r.action = 'enroll' and d.contact_id is not null then
    perform enroll_contact((r.action_config->>'sequence_id')::uuid, d.contact_id, d.id);
  elsif r.action = 'task' then
    insert into tasks (org_id, owner_id, title, due_date, deal_id, module)
    values (d.org_id, v_owner, replace(coalesce(r.action_config->>'title', r.name), '{{negocio}}', d.title),
            current_date + coalesce((r.action_config->>'days')::int, 0), d.id, 'crm');
  elsif r.action = 'move_stage' then
    select id into v_stage from stages where pipeline_id = d.pipeline_id and name = r.action_config->>'stage';
    if v_stage is not null and v_stage <> d.stage_id then update deals set stage_id = v_stage where id = d.id; end if;
  end if;
  insert into rule_log (rule_id, deal_id) values (r.id, d.id);
end $$;

-- Regras por evento (formulário, etapa, ganho, perdido)
create or replace function deals_fire_rules() returns trigger
language plpgsql security definer set search_path = p360, public as $$
declare r automation_rules%rowtype; v_stage text;
begin
  if pg_trigger_depth() > 2 then return null; end if;
  select name into v_stage from stages where id = new.stage_id;
  for r in select * from automation_rules where org_id = new.org_id and active loop
    if (r.trigger = 'form_lead' and tg_op = 'INSERT' and new.source = 'Formulário')
      or (r.trigger = 'stage_enter' and (tg_op = 'INSERT' or old.stage_id is distinct from new.stage_id) and v_stage = r.trigger_config->>'stage')
      or (r.trigger = 'deal_won' and new.status = 'won' and (tg_op = 'INSERT' or old.status is distinct from 'won'))
      or (r.trigger = 'deal_lost' and new.status = 'lost' and (tg_op = 'INSERT' or old.status is distinct from 'lost')) then
      perform apply_rule(r, new.id);
    end if;
  end loop;
  return null;
end $$;
drop trigger if exists deals_fire_rules_trg on deals;
create trigger deals_fire_rules_trg after insert or update of stage_id on deals for each row execute function deals_fire_rules();

-- ---------------------------------------------------------------------
-- Motor: corre quando abres a plataforma (regras por tempo, sequências, pontuação)
-- ---------------------------------------------------------------------
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
    - case when c.unsubscribed_at is not null then 30 else 0 end))
  where c.org_id = p_org;

  return jsonb_build_object('criadas', v_created, 'paradas', v_stopped);
end $$;

-- ---------------------------------------------------------------------
-- Rastreio público (aberturas, cliques) e cancelamento de subscrição
-- ---------------------------------------------------------------------
create or replace function track_email(p_outbox uuid, p_type text) returns void
language sql security definer set search_path = p360, public as $$
  update outbox set opened_at = coalesce(opened_at, now()),
    clicked_at = case when p_type = 'click' then coalesce(clicked_at, now()) else clicked_at end
  where id = p_outbox and status = 'sent';
$$;
create or replace function unsubscribe(p_outbox uuid) returns text
language plpgsql security definer set search_path = p360, public as $$
declare v_contact uuid; v_org text;
begin
  select o.contact_id, coalesce(g.legal_name, g.name) into v_contact, v_org from outbox o join organizations g on g.id = o.org_id where o.id = p_outbox;
  if v_contact is null then return null; end if;
  update contacts set unsubscribed_at = coalesce(unsubscribed_at, now()), consent_marketing = false where id = v_contact;
  update enrollments en set status = 'stopped', stopped_reason = 'Cancelou a subscrição'
    where en.contact_id = v_contact and en.status = 'active';
  return v_org;
end $$;

-- Formulário público: consentimento RGPD
create or replace function public_lead_consent(p_slug text, p_email text, p_consent boolean) returns void
language sql security definer set search_path = p360, public as $$
  update contacts c set consent_marketing = p_consent, consent_at = case when p_consent then now() end
  from organizations o where o.public_slug = lower(p_slug) and c.org_id = o.id and lower(c.email) = lower(trim(p_email))
    and c.created_at > now() - interval '5 minutes';
$$;

grant select, insert, update, delete on sequences, sequence_steps, enrollments, outbox, automation_rules, campaigns to authenticated, service_role;
grant execute on function run_automations(uuid), enroll_contact(uuid, uuid, uuid), render_template(text, uuid, uuid) to authenticated, service_role;
grant execute on function track_email(uuid, text), unsubscribe(uuid), public_lead_consent(text, text, boolean) to anon, authenticated;
revoke execute on function run_automations(uuid), enroll_contact(uuid, uuid, uuid), render_template(text, uuid, uuid), apply_rule(automation_rules, uuid), deals_fire_rules() from anon, public;
grant execute on function mcp_call(text, text, jsonb), public_lead(text, text, text, text, text, text, text, text), public_form_info(text) to anon;
