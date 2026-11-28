set search_path = p360, public, extensions;
-- Pedido repetido (duplo clique ou nova tentativa do servidor): o mesmo email no mesmo lead magnet em 2 minutos conta como um só
create or replace function public_magnet_recent(p_org text, p_slug text, p_email text) returns uuid
language sql stable security definer set search_path = p360, public as $$
  select r.id from magnet_responses r join lead_magnets m on m.id = r.magnet_id join organizations o on o.id = r.org_id join contacts c on c.id = r.contact_id
  where o.public_slug = lower(p_org) and m.slug = lower(p_slug) and lower(c.email) = lower(trim(coalesce(p_email, ''))) and coalesce(trim(p_email), '') <> ''
    and r.created_at > now() - interval '2 minutes'
  order by r.created_at desc limit 1;
$$;
grant execute on function public_magnet_recent(text, text, text) to anon, authenticated;
