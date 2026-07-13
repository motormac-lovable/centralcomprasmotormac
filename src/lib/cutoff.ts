// Data de corte fixa para isolar as solicitações DEMO das solicitações reais de produção.
// Somente registros com created_at >= DATA_DE_CORTE_PRODUCAO são exibidos na plataforma.
// Para recuperar ou visualizar as solicitações DEMO anteriores aos testes reais, altere ou comente este filtro de data.
//
// ⚠️ TEMPORÁRIO — REUNIÃO DE APRESENTAÇÃO:
// A data de corte foi recuada para 2025-01-01 para reexibir TODO o histórico (incluindo DEMO)
// no Kanban e nos Relatórios de Gestão. Após a reunião, restaurar para:
//   new Date("2026-07-13T12:00:00-03:00")
export const DATA_DE_CORTE_PRODUCAO = new Date("2025-01-01T00:00:00-03:00"); // Horário de Brasília

// Formato ISO usado nos filtros `.gte("created_at", ...)` do Supabase.
export const DATA_DE_CORTE_PRODUCAO_ISO = DATA_DE_CORTE_PRODUCAO.toISOString();

