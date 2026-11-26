-- A ligação ao Claude chama mcp_call sem sessão (role anon); a função valida o token pessoal.
-- Atenção: migrações com "revoke execute on all functions ... from anon" removem esta permissão — repor sempre.
grant execute on function p360.mcp_call(text, text, jsonb) to anon;
