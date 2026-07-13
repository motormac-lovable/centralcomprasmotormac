// Data de corte fixa para isolar as solicitações DEMO das solicitações reais de produção.
// Somente registros com created_at >= DATA_DE_CORTE_PRODUCAO são exibidos na plataforma.
// Para recuperar ou visualizar as solicitações DEMO anteriores aos testes reais, altere ou comente este filtro de data.
export const DATA_DE_CORTE_PRODUCAO = new Date("2026-07-13T17:00:00-03:00"); // Horário oficial de Brasília

// Formato ISO usado nos filtros `.gte("created_at", ...)` do Supabase.
export const DATA_DE_CORTE_PRODUCAO_ISO = DATA_DE_CORTE_PRODUCAO.toISOString();
