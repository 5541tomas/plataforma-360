set search_path = p360, public, extensions;

-- =====================================================================
-- Ligação ao Claude (MCP): uma única função, chamada com o token pessoal.
-- O token é validado aqui (só o hash está guardado) e TODAS as permissões
-- do membro são verificadas manualmente, porque a função corre como dono.
-- =====================================================================
create or replace function mcp_call(p_token text, p_tool text, p_args jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = p360, public as $$
declare
  v_tok api_tokens%rowtype;
  m members%rowtype;
  v_org uuid; v_user uuid;
  a jsonb := coalesce(p_args, '{}'::jsonb);
  txt text := '';
  r record;
  v_id uuid; v_pipe uuid; v_stage uuid; v_prod products%rowtype; v_acc uuid; v_cat uuid;
  v_amount numeric; v_q text; v_year int; v_target numeric; v_sold numeric; v_pipe_w numeric;
begin
  if p_token is null or length(p_token) < 32 then raise exception 'Token inválido'; end if;
  select * into v_tok from api_tokens where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  if not found then raise exception 'Token inválido ou revogado'; end if;
  v_org := v_tok.org_id; v_user := v_tok.user_id;
  select * into m from members where org_id = v_org and user_id = v_user;
  if not found then raise exception 'Sem acesso a esta organização'; end if;
  update api_tokens set last_used_at = now() where id = v_tok.id;
  -- faz auth.uid() devolver este utilizador dentro desta transação (defaults e triggers)
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_user::text, true);

  -- ---------------------------------------------------------------
  if p_tool = 'resumo_do_dia' then
    txt := 'Resumo de ' || to_char(current_date, 'DD/MM/YYYY') || E'\n';
    txt := txt || E'\nTarefas (hoje e em atraso):';
    for r in select title, due_date from tasks where org_id = v_org and owner_id = v_user and not done and (due_date is null or due_date <= current_date) order by due_date nulls last limit 15 loop
      txt := txt || E'\n- ' || r.title || coalesce(' (prazo ' || to_char(r.due_date, 'DD/MM') || ')', '');
    end loop;
    if m.perm_crm <> 'none' then
      select coalesce(sum(weighted_value), 0) into v_pipe_w from v_deals where org_id = v_org and status = 'open';
      txt := txt || E'\n\nPipeline: ' || (select count(*) from deals where org_id = v_org and status = 'open') || ' negócios abertos, ponderado ' || round(v_pipe_w) || ' €';
      for r in select title, last_activity_at from v_deals where org_id = v_org and is_cooling order by weighted_value desc limit 5 loop
        txt := txt || E'\n- A arrefecer: ' || r.title || ' (último contacto ' || to_char(r.last_activity_at, 'DD/MM') || ')';
      end loop;
    end if;
    if m.perm_finance <> 'none' then
      txt := txt || E'\n\nLiquidez: ' || coalesce((select round(sum(balance)) from v_account_balances b where b.org_id = v_org and b.type in ('checking','savings','cash')
        and ((b.scope = 'personal' and b.owner_id = v_user) or b.scope = 'business')), 0) || ' €';
    end if;
    return jsonb_build_object('text', txt);

  -- ---------------------------------------------------------------
  elsif p_tool = 'estado_da_meta' then
    if m.perm_goals = 'none' then raise exception 'Sem acesso a Objetivos'; end if;
    v_year := coalesce((a->>'ano')::int, (select extract(year from period_start)::int from goals where org_id = v_org and horizon = 'year' and status <> 'dropped' and extract(year from period_start) >= extract(year from current_date) order by period_start limit 1), extract(year from current_date)::int);
    select k.target_value into v_target from key_results k join goals g on g.id = k.goal_id
      where g.org_id = v_org and g.horizon = 'year' and extract(year from g.period_start) = v_year and (k.source = 'finance_income' or k.unit = '€') order by (k.source = 'finance_income') desc limit 1;
    select coalesce(sum(case when kind = 'retainer' then value * duration_months else value end), 0) into v_sold from deals where org_id = v_org and status = 'won' and extract(year from won_at) = v_year;
    select coalesce(sum(weighted_value), 0) into v_pipe_w from v_deals where org_id = v_org and status = 'open';
    txt := 'Meta ' || v_year || ': ' || coalesce(round(v_target)::text || ' €', 'sem meta de faturação definida') || E'\nVendido: ' || round(v_sold) || ' €' ||
      case when v_target > 0 then ' (' || round(v_sold / v_target * 100) || '%)' else '' end || E'\nPipeline ponderado: ' || round(v_pipe_w) || ' €';
    for r in select g.title, k.label, k.target_value, kr.computed_value from goals g join key_results k on k.goal_id = g.id join v_key_results kr on kr.id = k.id
      where g.org_id = v_org and g.horizon = 'year' and extract(year from g.period_start) = v_year and (not g.is_private or g.owner_id = v_user) order by k.position loop
      txt := txt || E'\n- ' || r.label || ': ' || round(r.computed_value, 1) || ' / ' || round(r.target_value, 1);
    end loop;
    return jsonb_build_object('text', txt);

  -- ---------------------------------------------------------------
  elsif p_tool = 'procurar' then
    if m.perm_crm = 'none' then raise exception 'Sem acesso ao CRM'; end if;
    v_q := '%' || coalesce(a->>'texto', '') || '%';
    txt := 'Resultados:';
    for r in select title, stage_name, value, kind, company_name from v_deals where org_id = v_org and (title ilike v_q or company_name ilike v_q or contact_name ilike v_q) order by created_at desc limit 10 loop
      txt := txt || E'\n- Negócio: ' || r.title || coalesce(' · ' || r.company_name, '') || ' · ' || r.stage_name || ' · ' || round(r.value) || ' €' || case when r.kind = 'retainer' then '/mês' else '' end;
    end loop;
    for r in select c.name, c.email, c.phone, co.name as company from contacts c left join companies co on co.id = c.company_id where c.org_id = v_org and (c.name ilike v_q or c.email ilike v_q or co.name ilike v_q) order by c.name limit 10 loop
      txt := txt || E'\n- Contacto: ' || r.name || coalesce(' · ' || r.company, '') || coalesce(' · ' || r.email, '') || coalesce(' · ' || r.phone, '');
    end loop;
    return jsonb_build_object('text', txt);

  -- ---------------------------------------------------------------
  elsif p_tool = 'criar_tarefa' then
    insert into tasks (org_id, owner_id, title, due_date, module)
    values (v_org, v_user, left(a->>'titulo', 300), coalesce((a->>'prazo')::date, current_date), 'goals') returning id into v_id;
    return jsonb_build_object('text', 'Tarefa criada: ' || (a->>'titulo') || ' (prazo ' || to_char(coalesce((a->>'prazo')::date, current_date), 'DD/MM/YYYY') || ').');

  -- ---------------------------------------------------------------
  elsif p_tool = 'registar_nota' then
    if m.perm_crm <> 'write' then raise exception 'Sem permissão de escrita no CRM'; end if;
    select id into v_id from deals where org_id = v_org and title ilike '%' || (a->>'negocio') || '%' order by (status = 'open') desc, created_at desc limit 1;
    if v_id is null then return jsonb_build_object('text', 'Não encontrei nenhum negócio com "' || coalesce(a->>'negocio', '') || '". Usa a ferramenta procurar para ver os nomes.'); end if;
    insert into activities (org_id, deal_id, type, summary, created_by)
    values (v_org, v_id, coalesce(nullif(a->>'tipo', ''), 'note')::activity_type, left(a->>'texto', 4000), v_user);
    if (a->>'follow_up') is not null then
      insert into tasks (org_id, owner_id, title, due_date, deal_id, module)
      values (v_org, v_user, 'Follow-up: ' || (select title from deals where id = v_id), (a->>'follow_up')::date, v_id, 'crm');
    end if;
    return jsonb_build_object('text', 'Registado no negócio "' || (select title from deals where id = v_id) || '".' || case when (a->>'follow_up') is not null then ' Follow-up agendado.' else '' end);

  -- ---------------------------------------------------------------
  elsif p_tool = 'criar_negocio' then
    if m.perm_crm <> 'write' then raise exception 'Sem permissão de escrita no CRM'; end if;
    select id into v_pipe from pipelines where org_id = v_org order by position limit 1;
    select id into v_stage from stages where pipeline_id = v_pipe and not is_won and not is_lost order by position limit 1;
    if (a->>'produto') is not null then
      select * into v_prod from products where org_id = v_org and active and name ilike '%' || (a->>'produto') || '%' order by position limit 1;
    end if;
    if coalesce(a->>'empresa', '') <> '' then
      select id into v_id from companies where org_id = v_org and name ilike (a->>'empresa') limit 1;
      if v_id is null then insert into companies (org_id, name) values (v_org, a->>'empresa') returning id into v_id; end if;
    end if;
    insert into deals (org_id, pipeline_id, stage_id, company_id, owner_id, title, kind, value, duration_months, product_id, expected_close, source)
    values (v_org, v_pipe, v_stage, v_id, v_user, a->>'titulo',
      coalesce(v_prod.kind, coalesce(nullif(a->>'tipo', ''), 'one_off')::deal_kind),
      coalesce((a->>'valor')::numeric, v_prod.price, 0), coalesce(v_prod.duration_months, 12), v_prod.id,
      (a->>'fecho_previsto')::date, a->>'origem')
    returning id into v_id;
    return jsonb_build_object('text', 'Negócio criado: ' || (a->>'titulo') || coalesce(' · produto ' || v_prod.name, '') || ' · ' || coalesce((a->>'valor')::numeric, v_prod.price, 0) || ' €.');

  -- ---------------------------------------------------------------
  elsif p_tool = 'marcar_ganho' then
    if m.perm_crm <> 'write' then raise exception 'Sem permissão de escrita no CRM'; end if;
    select id, pipeline_id into v_id, v_pipe from deals where org_id = v_org and status = 'open' and title ilike '%' || (a->>'negocio') || '%' order by created_at desc limit 1;
    if v_id is null then return jsonb_build_object('text', 'Não encontrei nenhum negócio aberto com "' || coalesce(a->>'negocio', '') || '".'); end if;
    select id into v_stage from stages where pipeline_id = v_pipe and is_won limit 1;
    update deals set stage_id = v_stage, value = coalesce((a->>'valor')::numeric, value) where id = v_id;
    return jsonb_build_object('text', 'Parabéns! "' || (select title from deals where id = v_id) || '" marcado como ganho. Receita recorrente, objetivos e tarefa de onboarding atualizados.');

  -- ---------------------------------------------------------------
  elsif p_tool = 'registar_movimento' then
    v_amount := (a->>'valor')::numeric;
    if v_amount is null or v_amount = 0 then raise exception 'Indica o valor (negativo para despesas)'; end if;
    select id into v_acc from accounts ac where ac.org_id = v_org and not ac.archived
      and ((ac.scope = 'personal' and ac.owner_id = v_user) or (ac.scope = 'business' and m.perm_finance = 'write'))
      and (coalesce(a->>'conta', '') = '' or ac.name ilike '%' || (a->>'conta') || '%' or ac.bank ilike '%' || (a->>'conta') || '%')
      order by (ac.scope = coalesce(nullif(a->>'ambito', ''), 'business')::fin_scope) desc, ac.created_at limit 1;
    if v_acc is null then return jsonb_build_object('text', 'Não encontrei nenhuma conta onde possas registar este movimento.'); end if;
    if coalesce(a->>'categoria', '') <> '' then
      select id into v_cat from categories where org_id = v_org and scope = (select scope from accounts where id = v_acc) and name ilike '%' || (a->>'categoria') || '%' limit 1;
    end if;
    insert into transactions (org_id, account_id, date, description, amount, category_id)
    values (v_org, v_acc, coalesce((a->>'data')::date, current_date), left(a->>'descricao', 300), v_amount, v_cat);
    return jsonb_build_object('text', 'Movimento registado em ' || (select name from accounts where id = v_acc) || ': ' || (a->>'descricao') || ' ' || v_amount || ' €' || coalesce(' · ' || (select name from categories where id = v_cat), '') || '.');
  end if;

  raise exception 'Ferramenta desconhecida: %', p_tool;
end $$;

revoke all on function mcp_call(text, text, jsonb) from public;
grant execute on function mcp_call(text, text, jsonb) to anon, authenticated, service_role;
