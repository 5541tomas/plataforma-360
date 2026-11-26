set search_path = p360, public, extensions;

-- A vista expande d.* no momento em que é criada: recriar sempre que se acrescentam colunas a deals
-- (faltavam ai_brief e delivery_end, o que avariava a criação de propostas)
drop view if exists v_deals;
create view v_deals with (security_invoker = true) as
select d.*,
       s.name as stage_name, s.position as stage_position,
       coalesce(d.probability, s.probability) as eff_probability,
       case when d.kind = 'retainer' then d.value * d.duration_months else d.value end as total_value,
       round((case when d.kind = 'retainer' then d.value * d.duration_months else d.value end)
             * coalesce(d.probability, s.probability) / 100.0, 2) as weighted_value,
       c.name as company_name,
       p.name as product_name, p.hours_per_unit as product_hours,
       ct.name as contact_name, ct.phone as contact_phone, ct.email as contact_email,
       rb.name as referred_by_name,
       (d.status = 'open' and d.last_activity_at < now() - interval '10 days') as is_cooling
from deals d
join stages s on s.id = d.stage_id
left join companies c on c.id = d.company_id
left join products p on p.id = d.product_id
left join contacts ct on ct.id = d.contact_id
left join contacts rb on rb.id = d.referred_by;

grant select on v_deals to authenticated, service_role;
