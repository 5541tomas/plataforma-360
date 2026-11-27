set search_path = p360, public, extensions;
-- Domínio próprio por lead magnet (ex.: 7erros.thomasfaria.pt → página do guia)
alter table lead_magnets add column if not exists custom_domain text;
create unique index if not exists lead_magnets_custom_domain on lead_magnets(lower(custom_domain)) where custom_domain is not null;

create or replace function public_domain_route(p_host text) returns text
language sql stable security definer set search_path = p360, public as $$
  select '/d/' || o.public_slug || '/' || m.slug
  from lead_magnets m join organizations o on o.id = m.org_id
  where lower(m.custom_domain) = lower(regexp_replace(coalesce(p_host, ''), ':\d+$', '')) and m.active and o.public_slug is not null
  limit 1;
$$;
grant execute on function public_domain_route(text) to anon, authenticated;
