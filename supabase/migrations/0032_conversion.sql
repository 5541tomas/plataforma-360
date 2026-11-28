set search_path = p360, public, extensions;

-- =====================================================================
-- CONVERSÃO: envio imediato do guia, alerta de nova lead e prova social
-- =====================================================================
alter table magnet_responses add column if not exists notified_at timestamptz;
alter table bookings add column if not exists notified_at timestamptz;

-- Para onde vão os alertas: definições → resumo diário → email da conta
create or replace function owner_alert_email(p_org uuid) returns text
language sql stable security definer set search_path = p360, public as $$
  select coalesce(nullif(o.settings->'notify'->>'email', ''), nullif(o.settings->'digest'->>'email', ''), (select email from auth.users where id = o.created_by))
  from organizations o where o.id = p_org;
$$;
revoke execute on function owner_alert_email(uuid) from anon, authenticated, public;

create or replace function sender_of(o organizations) returns jsonb
language sql stable as $$
  select jsonb_build_object('org_name', coalesce(o.legal_name, o.name),
    'from_name', coalesce(nullif(o.settings->'email'->>'from_name', ''), o.signature_name, 'Thomas Faria'),
    'from_email', coalesce(nullif(o.settings->'email'->>'from_email', ''), 'geral@thomasfaria.pt'),
    'reply_to', nullif(o.settings->'email'->>'reply_to', ''));
$$;

-- Logo a seguir ao pedido (uma única vez, até 15 minutos depois):
--  • devolve o email do guia para sair já (só guias, e só se auto_email não estiver desligado)
--  • devolve o alerta de nova lead para o dono
create or replace function public_magnet_after(p_rid uuid) returns jsonb
language plpgsql security definer set search_path = p360, public as $$
declare r magnet_responses%rowtype; m lead_magnets%rowtype; o organizations%rowtype; c contacts%rowtype; ob outbox%rowtype; v_mail jsonb; v_alert jsonb;
begin
  update magnet_responses set notified_at = now() where id = p_rid and notified_at is null and created_at > now() - interval '15 minutes' returning * into r;
  if not found then return null; end if;
  select * into m from lead_magnets where id = r.magnet_id;
  select * into o from organizations where id = r.org_id;
  select * into c from contacts where id = r.contact_id;
  if m.kind = 'guide' and coalesce((m.offer->>'auto_email')::boolean, true) then
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
  if coalesce((o.settings->'notify'->>'leads')::boolean, true) then
    v_alert := jsonb_build_object('to', owner_alert_email(o.id), 'name', c.name, 'email', c.email, 'phone', c.phone, 'area', c.area, 'channel', c.channel,
      'magnet', m.title, 'kind', m.kind, 'total', r.total, 'weakest', r.weakest, 'deal_id', r.deal_id, 'contact_id', r.contact_id);
  end if;
  return jsonb_build_object('mail', v_mail, 'alert', v_alert, 'sender', sender_of(o));
end $$;

-- Se o envio falhar, o email volta para a fila de aprovação
create or replace function public_magnet_mail_failed(p_rid uuid, p_outbox uuid, p_error text) returns void
language sql security definer set search_path = p360, public as $$
  update outbox set status = 'pending', sent_at = null, error = left(p_error, 300)
  where id = p_outbox and status = 'sent' and contact_id = (select contact_id from magnet_responses where id = p_rid and notified_at > now() - interval '15 minutes');
$$;

-- Alerta de nova marcação (uma vez)
create or replace function public_booking_after(p_id uuid) returns jsonb
language plpgsql security definer set search_path = p360, public as $$
declare b bookings%rowtype; o organizations%rowtype;
begin
  update bookings set notified_at = now() where id = p_id and notified_at is null and created_at > now() - interval '15 minutes' returning * into b;
  if not found then return null; end if;
  select * into o from organizations where id = b.org_id;
  if not coalesce((o.settings->'notify'->>'leads')::boolean, true) then return null; end if;
  return jsonb_build_object('alert', jsonb_build_object('to', owner_alert_email(o.id), 'name', b.name, 'email', b.email, 'phone', b.phone, 'notes', b.notes,
    'starts_at', b.starts_at, 'deal_id', b.deal_id, 'contact_id', b.contact_id), 'sender', sender_of(o));
end $$;

-- Página pública com prova social (testemunhos + número de pedidos)
create or replace function public_magnet(p_org text, p_slug text) returns jsonb
language plpgsql security definer set search_path = p360, public as $$
declare v jsonb; v_id uuid;
begin
  select m.id, jsonb_build_object('id', m.id, 'kind', m.kind, 'title', m.title, 'subtitle', m.subtitle, 'config', m.config,
      'org', coalesce(o.legal_name, o.name), 'author', coalesce(o.signature_name, pr.full_name, o.name),
      'booking', coalesce((o.booking->>'enabled')::boolean, false), 'slug', o.public_slug,
      'offer', jsonb_build_object('whatsapp', m.offer->>'whatsapp', 'keyword', m.offer->>'keyword', 'guide_url', m.offer->>'guide_url', 'meeting_url', m.offer->>'meeting_url'),
      'proof', jsonb_build_object('testimonials', o.testimonials, 'count', (select count(*) from magnet_responses x where x.magnet_id = m.id)))
    into v_id, v
  from lead_magnets m join organizations o on o.id = m.org_id left join profiles pr on pr.id = o.created_by
  where o.public_slug = lower(p_org) and m.slug = lower(p_slug) and m.active;
  if v_id is null then return null; end if;
  update lead_magnets set views = views + 1 where id = v_id;
  return v;
end $$;

grant execute on function public_magnet_after(uuid), public_magnet_mail_failed(uuid, uuid, text), public_booking_after(uuid), public_magnet(text, text) to anon, authenticated;
revoke execute on function sender_of(organizations) from anon, public;
