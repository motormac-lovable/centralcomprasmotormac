GRANT SELECT ON public.kanban_cards TO anon;
CREATE POLICY "Public status lookup by codigo_unico" ON public.kanban_cards FOR SELECT TO anon USING (true);