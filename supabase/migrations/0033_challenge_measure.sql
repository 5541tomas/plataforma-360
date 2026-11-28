set search_path = p360, public, extensions;

-- =====================================================================
-- DESAFIO 7 DIAS (2.ª sequência por lead magnet) + MEDIÇÃO (visitas por canal, A/B, Pixel)
-- =====================================================================
alter table lead_magnets add column if not exists sequence2_id uuid references sequences(id) on delete set null;

create table if not exists magnet_views (
  magnet_id uuid not null references lead_magnets(id) on delete cascade,
  org_id    uuid not null references organizations(id) on delete cascade,
  day       date not null default current_date,
  channel   text not null default 'direto',
  variant   text not null default 'A',
  n         int  not null default 0,
  primary key (magnet_id, day, channel, variant)
);
alter table magnet_views enable row level security;
drop policy if exists mv_read on magnet_views;
create policy mv_read on magnet_views for select using (can_read(org_id, 'crm'));
grant select on magnet_views to authenticated;

drop function if exists public_magnet(text, text);
create or replace function public_magnet(p_org text, p_slug text, p_channel text default null, p_variant text default null) returns jsonb
language plpgsql security definer set search_path = p360, public as $$
declare v jsonb; v_id uuid; v_org uuid; v_ch text; v_var text;
begin
  select m.id, o.id, jsonb_build_object('id', m.id, 'kind', m.kind, 'title', m.title, 'subtitle', m.subtitle, 'config', m.config,
      'org', coalesce(o.legal_name, o.name), 'author', coalesce(o.signature_name, pr.full_name, o.name),
      'booking', coalesce((o.booking->>'enabled')::boolean, false), 'slug', o.public_slug,
      'offer', jsonb_build_object('whatsapp', m.offer->>'whatsapp', 'keyword', m.offer->>'keyword', 'guide_url', m.offer->>'guide_url', 'meeting_url', m.offer->>'meeting_url'),
      'proof', jsonb_build_object('testimonials', o.testimonials, 'count', (select count(*) from magnet_responses x where x.magnet_id = m.id)),
      'pixel', nullif(o.settings->'pixel'->>'meta', ''))
    into v_id, v_org, v
  from lead_magnets m join organizations o on o.id = m.org_id left join profiles pr on pr.id = o.created_by
  where o.public_slug = lower(p_org) and m.slug = lower(p_slug) and m.active;
  if v_id is null then return null; end if;
  update lead_magnets set views = views + 1 where id = v_id;
  v_ch := coalesce(nullif(lower(left(regexp_replace(coalesce(p_channel, ''), '[^a-zA-Z0-9_-]', '', 'g'), 30)), ''), 'direto');
  v_var := case when p_variant = 'B' then 'B' else 'A' end;
  insert into magnet_views (magnet_id, org_id, channel, variant, n) values (v_id, v_org, v_ch, v_var, 1)
  on conflict (magnet_id, day, channel, variant) do update set n = magnet_views.n + 1;
  return v;
end $$;

-- Resultado / obrigado: igual, com o Pixel
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
    'has_ebook', exists (select 1 from lead_magnets e where e.org_id = o.id and e.kind = 'ebook' and e.active),
    'pixel', nullif(o.settings->'pixel'->>'meta', ''))
  from magnet_responses r join lead_magnets m on m.id = r.magnet_id join organizations o on o.id = r.org_id
  left join contacts c on c.id = r.contact_id left join profiles pr on pr.id = o.created_by
  where r.id = p_rid;
$$;

-- Depois do pedido: + inscrição na 2.ª sequência (desafio por email) quando há email e consentimento
drop function if exists public_magnet_after(uuid);
create or replace function public_magnet_after(p_rid uuid, p_send boolean default true) returns jsonb
language plpgsql security definer set search_path = p360, public as $$
declare r magnet_responses%rowtype; m lead_magnets%rowtype; o organizations%rowtype; c contacts%rowtype; ob outbox%rowtype; v_mail jsonb; v_alert jsonb;
begin
  update magnet_responses set notified_at = now() where id = p_rid and notified_at is null and created_at > now() - interval '15 minutes' returning * into r;
  if not found then return null; end if;
  select * into m from lead_magnets where id = r.magnet_id;
  select * into o from organizations where id = r.org_id;
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

grant execute on function public_magnet(text, text, text, text), public_magnet_result(uuid), public_magnet_after(uuid, boolean) to anon, authenticated;
