REVOKE EXECUTE ON FUNCTION public.append_quotation_attachments(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.append_quotation_attachments(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.append_quotation_attachments(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.append_quotation_attachments(uuid, jsonb) TO service_role;