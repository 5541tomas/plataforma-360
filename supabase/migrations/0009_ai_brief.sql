set search_path = p360, public, extensions;
-- Resultado do copiloto de reuniões (contexto e objetivos para a próxima proposta)
alter table deals add column if not exists ai_brief jsonb;
