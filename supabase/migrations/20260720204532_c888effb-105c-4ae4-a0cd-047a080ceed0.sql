ALTER FUNCTION public.gerar_codigo_unico() SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION public.gerar_codigo_unico() TO authenticated, anon;
GRANT USAGE, SELECT, UPDATE ON SEQUENCE public.solicitacao_seq TO authenticated, anon, service_role;