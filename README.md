# Plataforma 360

Objetivos, finanças (pessoais e da empresa) e CRM numa única plataforma, com os três módulos ligados entre si.

## Stack
- Next.js 15 (App Router, Server Actions) + TypeScript + Tailwind CSS 4
- Supabase: Postgres, Auth e Row Level Security (RLS)

## Arrancar
1. Cria um projeto no Supabase (região UE).
2. Corre `supabase/migrations/0001_init.sql` no SQL Editor (ou faz `supabase db push`).
3. Copia `.env.example` para `.env.local` e preenche com o URL e a anon key do projeto.
4. Corre `npm install` e depois `npm run dev`. A app fica em http://localhost:3000.

## Modelo
- **Organizações e membros**: cada membro tem uma permissão por módulo (`goals`, `finance`, `crm`), com os níveis `none`, `read` ou `write`. Um colaborador só com CRM fica com `finance=none` e `goals=none`.
- **Finanças pessoais**: são sempre privadas para o dono, imposto por RLS e não só na interface.
- **Automação** (`deals_on_stage_change`): quando um negócio passa a "Ganho", uma avença cria uma receita recorrente na empresa e é criada uma tarefa de onboarding. Os KRs automáticos (`v_key_results`) refletem isto de imediato.
- **Fontes automáticas de KR**: receita da empresa, poupança e investimentos, receita recorrente (MRR), valor ganho e número de negócios ganhos, e hábitos.

## Roadmap
- [x] Fase 1: autenticação, organizações, permissões, CRM com vários pipelines, finanças pessoal/empresa, OKRs, tarefas, hábitos e dashboard "Hoje"
- [ ] Assistente IA (Claude) e categorização automática
- [ ] Importação de extratos CSV (Santander, ActivoBank, ABANCA)
- [ ] Gmail e Google Calendar → atividades do CRM
- [ ] Propostas em PDF
- [ ] Gestão de membros e convites (UI)
- [ ] Open Banking, Stripe (planos do SaaS)
