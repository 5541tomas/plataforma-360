-- KR automático: unidades vendidas de um produto (negócios ganhos no período)
-- (o ALTER TYPE tem de correr numa transação separada da vista)
alter type p360.kr_source add value if not exists 'crm_product_units';
