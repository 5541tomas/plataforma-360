set search_path = p360, public, extensions;
-- Funções internas: só são usadas dentro de outras funções (security definer) ou por triggers.
-- Não devem poder ser chamadas diretamente por utilizadores (a autenticação é partilhada com outra app).
revoke execute on function apply_rule(automation_rules, uuid) from anon, authenticated, public;
revoke execute on function render_template(text, uuid, uuid) from anon, authenticated, public;
revoke execute on function org_vat(uuid) from anon, authenticated, public;
revoke execute on function deals_after_won() from anon, authenticated, public;
revoke execute on function debts_sync() from anon, authenticated, public;
revoke execute on function deals_fire_rules() from anon, authenticated, public;
